export const symbols: Record<string, string> = { RUB: "₽", USD: "$", EUR: "€" };
export const toMinor = (n: number) => BigInt(Math.round(n * 100));
export const cardDTO = (c: Record<string, any>) => ({
  id: c.id,
  num: c.number.replace(/ /g, "").slice(-4),
  holder: c.holder,
  balance: Number(c.balance_minor) / 100,
  balanceMinor: String(c.balance_minor),
  cur: symbols[c.currency],
  code: c.currency,
  tone: c.tone,
  frozen: c.frozen,
});
