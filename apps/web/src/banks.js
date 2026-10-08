export const BANKS = [
  { id: "cardo", name: "Cardo", favorite: true },
  { id: "tbank", name: "Т-Банк" },
  { id: "vtb", name: "ВТБ" },
  { id: "tochka", name: "Точка" },
  { id: "revolut", name: "Revolut" },
  { id: "wise", name: "Wise" },
  { id: "sber", name: "Сбер" },
  { id: "alfa", name: "Альфа-Банк" },
  { id: "gazprombank", name: "Газпромбанк" },
  { id: "raiffeisen", name: "Райффайзенбанк" },
  { id: "sovcombank", name: "Совкомбанк" },
  { id: "ozon", name: "Ozon Банк" },
];
export function bankName(id, fallback) {
  return (
    BANKS.find((bank) => bank.id === id)?.name || fallback || id || "Cardo"
  );
}
export function recipientBank(recipient) {
  return recipient.bankId || (recipient.kind === "registered" ? "cardo" : null);
}

export function maskedRecipientReference(recipient) {
  const reference = String(recipient.acct || "");
  const digits = reference.replace(/\D/g, "");
  return digits.length >= 4 ? "•• " + digits.slice(-4) : reference;
}
