import test from "node:test";
import assert from "node:assert/strict";
import { createRateFeed } from "../services/rates/src/feed.ts";
import { parseCbrRates, fetchCbrRates, RatesProviderError, CBR_SOURCE_URL } from "../services/rates/src/provider.ts";
import { createRatesApp } from "../services/rates/src/app.ts";

const entry = (code, value, nominal = "1") => `<Valute ID="${code}"><NumCode>000</NumCode><CharCode>${code}</CharCode><Nominal>${nominal}</Nominal><Name>Currency</Name><Value>${value}</Value></Valute>`;
const xml = (date = "08.10.2026", usd = "85,4811", eur = "96,3287") => `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="${date}" name="Foreign Currency Market">${entry("USD", usd)}${entry("EUR", eur)}</ValCurs>`;
const official = parseCbrRates(xml());
const providerError = (code) => (error) => error instanceof RatesProviderError && error.code === code;

function memoryStore() {
  const history = new Map();
  let state = null;
  return {
    history,
    async latest() {
      return structuredClone([...history.values()].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.publishedAt.localeCompare(a.publishedAt))[0] || null);
    },
    async state() { return structuredClone(state); },
    async save(rates, checkedAt) {
      if (!history.has(rates.version)) history.set(rates.version, structuredClone({ ...rates, base: "RUB", source: "cbr", publishedAt: checkedAt }));
      state = { attemptedAt: checkedAt, succeededAt: checkedAt, errorCode: null };
    },
    async failure(checkedAt, code) {
      state = { attemptedAt: checkedAt, succeededAt: state?.succeededAt || null, errorCode: code };
    },
  };
}

test("CBR parsing handles official date, decimal comma, nominal and exact rounding", () => {
  assert.equal(official.effectiveDate, "2026-10-08");
  assert.deepEqual(official.units, { RUB: "10000", USD: "854811", EUR: "963287" });
  const normalized = parseCbrRates(xml().replace(entry("USD", "85,4811"), entry("USD", "854,8110", "10")));
  assert.deepEqual(normalized, official);
  const reversed = parseCbrRates(`<ValCurs Date="08.10.2026">${entry("EUR", "96,3287")}${entry("USD", "85,4811")}</ValCurs>`);
  assert.equal(reversed.version, official.version);
  assert.equal(parseCbrRates(xml("08.10.2026", "1,23455")).units.USD, "12346");
});

test("CBR parser rejects missing or duplicate currencies, invalid dates, nominal and XML", () => {
  for (const malformed of [
    xml().replace(entry("EUR", "96,3287"), ""),
    xml().replace("</ValCurs>", entry("USD", "86,0000") + "</ValCurs>"),
    xml("31.02.2026"),
    xml().replace("<Nominal>1</Nominal>", "<Nominal>0</Nominal>"),
    xml("08.10.2026", "-1,0000"),
    xml("08.10.2026", "0,0000"),
    xml("08.10.2026", "NaN"),
    xml().replace("</ValCurs>", "<unexpected/>" + "</ValCurs>"),
    "<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///test'>]>" + xml(),
    "<html>Unavailable</html>",
  ]) assert.throws(() => parseCbrRates(malformed), providerError("CBR_INVALID_RESPONSE"));
});

test("CBR fetch requests Moscow day from the official HTTPS source", async () => {
  let supplied;
  const result = await fetchCbrRates(new Date("2026-10-07T22:00:00.000Z"), async (url, init) => {
    supplied = { url: String(url), init };
    return new Response(xml());
  });
  assert.deepEqual(result, official);
  assert.equal(new URL(supplied.url).origin + new URL(supplied.url).pathname, CBR_SOURCE_URL);
  assert.equal(new URL(supplied.url).searchParams.get("date_req"), "08/10/2026");
  assert.equal(supplied.init.redirect, "error");
  assert.ok(supplied.init.signal instanceof AbortSignal);
});

test("CBR fetch refuses upstream HTTP failures, oversized XML and future rates", async () => {
  const now = new Date("2026-10-08T10:00:00Z");
  await assert.rejects(fetchCbrRates(now, async () => new Response("Unavailable", { status: 503 })), providerError("CBR_HTTP_ERROR"));
  await assert.rejects(fetchCbrRates(now, async () => new Response("x".repeat(140000))), providerError("CBR_INVALID_RESPONSE"));
  await assert.rejects(fetchCbrRates(now, async () => new Response(xml("09.10.2026"))), providerError("CBR_INVALID_RESPONSE"));
  await assert.rejects(fetchCbrRates(now, async () => { throw new Error("connection failed"); }), providerError("CBR_NETWORK_ERROR"));
});

test("CBR timeout limits both connection and body reads", async () => {
  const now = new Date("2026-10-08T10:00:00Z");
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchCbrRates(now, async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }), 10), providerError("CBR_TIMEOUT"));
    await assert.rejects(fetchCbrRates(now, async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    })), 10), providerError("CBR_TIMEOUT"));
  } finally { clearTimeout(keepAlive); }
});

test("Rate feed single-flights requests and uses the persisted snapshot between refreshes", async () => {
  let now = Date.parse("2026-10-08T10:00:00Z"), calls = 0;
  const store = memoryStore();
  const feed = createRateFeed(store, { now: () => now, intervalMs: 1000, report() {}, provider: async () => { calls++; return official; } });
  const results = await Promise.all([feed.current(), feed.current(), feed.current()]);
  assert.equal(calls, 1);
  assert.equal(results[0].stale, false);
  assert.equal(results[0].fetchedAt, new Date(now).toISOString());
  await feed.current();
  assert.equal(calls, 1);
  const snapshotBefore = structuredClone(store.history.get(official.version));
  now += 2000;
  await feed.refresh();
  assert.equal(calls, 2);
  assert.equal(store.history.size, 1);
  assert.deepEqual(store.history.get(official.version), snapshotBefore);
});

test("A provider outage returns explicit last-known rates and survives a feed restart", async () => {
  let now = Date.parse("2026-10-08T10:00:00Z");
  const store = memoryStore();
  await store.save(official, new Date(now).toISOString());
  const feed = createRateFeed(store, { now: () => now, report() {}, provider: async () => { throw new RatesProviderError("CBR_TIMEOUT"); } });
  now += 3600000;
  await feed.refresh();
  const cached = await feed.current();
  assert.equal(cached.stale, true);
  assert.equal(cached.version, official.version);
  assert.equal(cached.fetchedAt, "2026-10-08T10:00:00.000Z");
  const restarted = createRateFeed(store, { now: () => now, report() {}, provider: async () => { throw new RatesProviderError("CBR_NETWORK_ERROR"); } });
  await restarted.start();
  assert.equal((await restarted.current()).stale, true);
  assert.equal((await restarted.current()).version, official.version);
  await restarted.stop();
});

test("No prior official snapshot gives 503 after a failed fetch and throttles retry", async () => {
  let calls = 0;
  const feed = createRateFeed(memoryStore(), { report() {}, provider: async () => { calls++; throw new RatesProviderError("CBR_HTTP_ERROR"); } });
  for (let i = 0; i < 2; i++) await assert.rejects(feed.current(), (error) => error.status === 503 && error.code === "RATES_UNAVAILABLE");
  assert.equal(calls, 1);
});

test("Refresh appends a new immutable version and cannot roll back the current date", async () => {
  let now = Date.parse("2026-10-08T10:00:00Z"), rates = official;
  const store = memoryStore();
  const feed = createRateFeed(store, { now: () => now, report() {}, provider: async () => rates });
  const first = await feed.current();
  const quote = { version: first.version, numerator: first.units.RUB, denominator: first.units.USD };
  now += 86400000;
  rates = parseCbrRates(xml("09.10.2026", "86,0000"));
  await feed.refresh();
  assert.equal((await feed.current()).units.USD, "860000");
  assert.equal(store.history.size, 2);
  assert.equal(quote.denominator, "854811");
  assert.equal(store.history.get(quote.version).units.USD, "854811");
  rates = official;
  await feed.refresh();
  const latest = await feed.current();
  assert.equal(latest.effectiveDate, "2026-10-09");
  assert.equal(latest.stale, true);
  assert.equal((await store.state()).errorCode, "CBR_OLDER_RESPONSE");
});

test("Rates API exposes official date and fallback state without changing the quote contract", async (t) => {
  const pool = { query: async () => ({ rows: [] }) };
  const snapshot = { ...official, base: "RUB", source: "cbr", publishedAt: "2026-10-08T10:00:00Z", fetchedAt: "2026-10-08T10:00:00Z", stale: true };
  const server = createRatesApp(pool, async () => snapshot).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); }));
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = { "X-Internal-Token": process.env.INTERNAL_TOKEN || "cardo-local-internal" };
  assert.equal((await fetch(base + "/api/rates")).status, 403);
  const published = await (await fetch(base + "/api/rates", { headers })).json();
  assert.equal(published.asOf, "2026-10-08");
  assert.equal(published.rates.USD, 85.4811);
  assert.equal(published.source, "cbr");
  assert.equal(published.sourceUrl, CBR_SOURCE_URL);
  assert.equal(published.stale, true);
  const quote = await (await fetch(base + "/internal/quotes?from=RUB&to=USD", { headers })).json();
  assert.deepEqual(quote, { version: official.version, from: "RUB", to: "USD", numerator: "10000", denominator: "854811" });
});
