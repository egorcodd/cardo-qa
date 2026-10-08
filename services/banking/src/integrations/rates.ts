import { upstream, fail } from "../../../../packages/shared/http.ts";
import type {
  Currency,
  RateQuote,
  RatesClient,
} from "../../../../packages/contracts/index.ts";
export function createRatesClient(baseUrl: string): RatesClient {
  return {
    async quote(from: Currency, to: Currency, requestId: string) {
      try {
        const response = await upstream(
          baseUrl + "/internal/quotes?" + new URLSearchParams({ from, to }),
          {},
          to === "EUR" ? undefined : requestId,
        );
        if (!response.ok) throw new Error("Rates HTTP " + response.status);
        const data = (await response.json()) as RateQuote;
        if (
          data.from !== from ||
          data.to !== to ||
          typeof data.version !== "string" ||
          !data.version ||
          !/^[1-9]\d{0,12}$/.test(data.numerator) ||
          !/^[1-9]\d{0,12}$/.test(data.denominator)
        )
          throw new Error("Invalid quote");
        return data;
      } catch {
        fail(
          503,
          "RATES_UNAVAILABLE",
          "Курсы временно недоступны. Попробуй обмен позже",
        );
      }
    },
  };
}
