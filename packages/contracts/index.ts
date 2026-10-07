export const currencies = ["RUB", "USD", "EUR"] as const;
export type Currency = (typeof currencies)[number];
export type RateQuote = {
  version: string;
  from: Currency;
  to: Currency;
  numerator: string;
  denominator: string;
};
export type RatesClient = {
  quote(from: Currency, to: Currency, requestId: string): Promise<RateQuote>;
};
export type TransferInput = {
  cardId: string;
  recipientId: string;
  amount: string;
  idempotencyKey: string;
};
export type User = {
  id: string;
  name: string;
  phone: string;
  language: "ru" | "en";
  theme: "light" | "dark" | "system";
  mainCardId: string;
  email: string;
  birth: string;
  avatarTone: "lime" | "dark" | "violet" | "blue";
  hideBalance: boolean;
  createdAt: string;
  passwordChangedAt: string;
};
export type DomainEvent = {
  id: string;
  type: "banking.transfer.completed";
  version: 1;
  userId: string;
  requestId: string;
  occurredAt: string;
  payload: {
    transferId: string;
    amount: string;
    currency: Currency;
    recipient: string;
  };
};
