import { externalBanks } from "../../../packages/contracts/index.ts";
import { fail } from "../../../packages/shared/http.ts";
export const banks = [
  { id: "cardo", name: "Cardo", favorite: true },
  ...externalBanks,
] as const;
export function resolveBank(value: unknown = "cardo") {
  const bank = banks.find((bank) => bank.id === value);
  if (!bank) fail(422, "INVALID_BANK", "Выбери банк получателя");
  return bank;
}
export function recipientReference(type: string, value: string) {
  const digits = value.replace(/\D/g, "");
  return type === "phone"
    ? "+7 ••• •••-" + digits.slice(-4)
    : "•••• " + digits.slice(-4);
}
