import { fail } from "../../../packages/shared/http.ts";
import { fetchCbrRates, RatesProviderError } from "./provider.ts";
import type { OfficialRates } from "./provider.ts";
import type { RateStore } from "./snapshots.ts";

type FeedOptions = {
  provider?: (now: Date) => Promise<OfficialRates>;
  now?: () => number;
  intervalMs?: number;
  report?: (code: string) => void;
};

export function createRateFeed(store: RateStore, options: FeedOptions = {}) {
  const provider = options.provider || fetchCbrRates;
  const now = options.now || Date.now;
  const intervalMs = options.intervalMs || 60 * 60 * 1000;
  const report = options.report || ((code: string) => console.error(JSON.stringify({ level: "warn", service: "rates", code })));
  let pending: Promise<void> | null = null;
  let lastAttempt = -Infinity;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  function refresh() {
    if (pending) return pending;
    lastAttempt = now();
    pending = (async () => {
      try {
        const rates = await provider(new Date(now()));
        const prior = await store.latest();
        if (prior && rates.effectiveDate < prior.effectiveDate)
          throw new RatesProviderError("CBR_OLDER_RESPONSE");
        await store.save(rates, new Date(now()).toISOString());
      } catch (error) {
        const code = error instanceof RatesProviderError ? error.code : "RATES_SYNC_FAILED";
        report(code);
        await store.failure(new Date(now()).toISOString(), code);
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  async function current() {
    if (now() - lastAttempt >= intervalMs) {
      const cached = await store.latest();
      if (cached) void refresh().catch(() => report("RATES_STATE_UNAVAILABLE"));
      else await refresh();
    }
    const [snapshot, state] = await Promise.all([store.latest(), store.state()]);
    if (!snapshot) fail(503, "RATES_UNAVAILABLE", "Курсы временно недоступны");
    return {
      ...snapshot,
      fetchedAt: state?.succeededAt || snapshot.publishedAt,
      stale: Boolean(state?.errorCode) || !state?.succeededAt || now() - Date.parse(state.succeededAt) > 2 * intervalMs,
    };
  }

  return {
    current,
    refresh,
    async start() {
      await refresh();
      if (!stopped && !timer) {
        timer = setInterval(() => {
          void refresh().catch(() => report("RATES_STATE_UNAVAILABLE"));
        }, intervalMs);
        timer.unref();
      }
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      await pending;
    },
  };
}
