import { createHash } from "node:crypto";

export const CBR_SOURCE_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
const maxBytes = 128 * 1024;

export type OfficialRates = {
  version: string;
  effectiveDate: string;
  units: Record<string, string>;
};

export class RatesProviderError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function invalid(): never {
  throw new RatesProviderError("CBR_INVALID_RESPONSE");
}

function tag(body: string, name: string) {
  const matches = [...body.matchAll(new RegExp("<" + name + ">(.*?)</" + name + ">", "g"))];
  if (matches.length !== 1) invalid();
  return matches[0][1].trim();
}

function normalizedRate(value: string, nominal: string) {
  if (!/^[1-9]\d{0,6}$/.test(nominal)) invalid();
  const parts = /^(\d{1,7}),(\d{1,8})$/.exec(value);
  if (!parts) invalid();
  const raw = BigInt(parts[1] + parts[2]);
  const divisor = BigInt(nominal) * 10n ** BigInt(parts[2].length);
  const scaled = (raw * 10000n + divisor / 2n) / divisor;
  if (scaled <= 0n || scaled > 1000000000000n) invalid();
  return scaled.toString();
}

export function parseCbrRates(xml: string): OfficialRates {
  if (xml.length > maxBytes || /<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
  const root = /^\s*(?:<\?xml[^?]*\?>\s*)?<ValCurs\b([^>]*)>([\s\S]*)<\/ValCurs>\s*$/.exec(xml);
  if (!root) invalid();
  const date = /\bDate=["'](\d{2})\.(\d{2})\.(\d{4})["']/.exec(root[1]);
  if (!date) invalid();
  const effectiveDate = date[3] + "-" + date[2] + "-" + date[1];
  const instant = new Date(effectiveDate + "T00:00:00.000Z");
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== effectiveDate)
    invalid();
  const units: Record<string, string> = { RUB: "10000" };
  let remainder = root[2];
  for (const entry of root[2].matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
    remainder = remainder.replace(entry[0], "");
    const code = tag(entry[1], "CharCode");
    if (!["USD", "EUR"].includes(code)) continue;
    if (units[code]) invalid();
    units[code] = normalizedRate(tag(entry[1], "Value"), tag(entry[1], "Nominal"));
  }
  if (remainder.trim() || !units.USD || !units.EUR) invalid();
  const normalized = { RUB: units.RUB, USD: units.USD, EUR: units.EUR };
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
  return { version: "cbr-" + effectiveDate + "-" + hash, effectiveDate, units: normalized };
}

function moscowDate(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function fetchCbrRates(
  now = new Date(),
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
) {
  const day = moscowDate(now);
  const url = new URL(CBR_SOURCE_URL);
  url.searchParams.set("date_req", day.split("-").reverse().join("/"));
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      headers: { Accept: "application/xml, text/xml" },
    });
    if (!response.ok) throw new RatesProviderError("CBR_HTTP_ERROR");
    if (!response.body) invalid();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > maxBytes) invalid();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const rates = parseCbrRates(new TextDecoder("windows-1251").decode(bytes));
    if (rates.effectiveDate > day) invalid();
    return rates;
  } catch (error) {
    if (error instanceof RatesProviderError) throw error;
    throw new RatesProviderError(
      error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "CBR_TIMEOUT"
        : "CBR_NETWORK_ERROR",
    );
  }
}
