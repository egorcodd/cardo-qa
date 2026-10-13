import { decimal } from "../../../packages/shared/validation.ts";
import { fail } from "../../../packages/shared/http.ts";
import type { Membership } from "./integrations/membership.ts";
export type TransferCurrency = "RUB" | "USD" | "EUR";
export function transferCurrency(value: unknown = "RUB"): TransferCurrency {
  if (value !== "RUB" && value !== "USD" && value !== "EUR")
    fail(422, "INVALID_CURRENCY", "Выбери RUB, USD или EUR");
  return value;
}
export function transferFee(membership: Membership, currency: TransferCurrency = "RUB") {
  const premium =
    membership.premium &&
    membership.expiresAt !== null &&
    Date.parse(membership.expiresAt) > Date.now();
  const fees = { RUB: [50000n, 10000n], USD: [500n, 100n], EUR: [500n, 100n] };
  const fee = fees[currency][premium ? 1 : 0];
  return {
    fee: decimal(fee),
    feeMinor: fee.toString(),
    currency,
    plan: premium ? "plus" : "standard",
  };
}
