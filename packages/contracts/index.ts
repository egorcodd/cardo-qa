export type Currency = "RUB" | "USD" | "EUR";
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
