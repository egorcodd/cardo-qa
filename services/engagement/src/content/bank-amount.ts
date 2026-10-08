import type { Currency } from "../../../../packages/contracts/index.ts";

export function bankAmount(amount: string, currency: Currency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
