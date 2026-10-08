export const externalBanks = [
  { id: "tbank", name: "Т-Банк", favorite: false },
  { id: "vtb", name: "ВТБ", favorite: false },
  { id: "tochka", name: "Точка", favorite: false },
  { id: "revolut", name: "Revolut", favorite: false },
  { id: "wise", name: "Wise", favorite: false },
  { id: "sber", name: "Сбер", favorite: false },
  { id: "alfa", name: "Альфа-Банк", favorite: false },
  { id: "gazprombank", name: "Газпромбанк", favorite: false },
  { id: "raiffeisen", name: "Райффайзенбанк", favorite: false },
  { id: "sovcombank", name: "Совкомбанк", favorite: false },
  { id: "ozon", name: "Ozon Банк", favorite: false },
] as const;
export type ExternalBankId = (typeof externalBanks)[number]["id"];
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
type EventBase = {
  id: string;
  userId: string;
  requestId: string;
  occurredAt: string;
};
export type DomainEvent = EventBase &
  (
    | {
        type: "banking.transfer.completed";
        version: 1;
        payload: {
          transferId: string;
          amount: string;
          currency: Currency;
          recipient: string;
        };
      }
    | {
        type: "banking.transfer.completed";
        version: 2;
        payload: {
          transferId: string;
          senderUserId: string;
          receiverUserId: string;
          senderOperationId: string;
          receiverOperationId: string;
          amount: string;
          currency: Currency;
          senderName: string;
          receiverName: string;
        };
      }
    | {
        type: "banking.external-transfer.completed";
        version: 1;
        payload: {
          operationId: string;
          amount: string;
          currency: Currency;
          bankId: ExternalBankId;
          bankName: string;
          recipientReference: string;
        };
      }
    | {
        type: "banking.top-up.completed";
        version: 1;
        payload: {
          operationId: string;
          amount: string;
          currency: Currency;
          balance: string;
        };
      }
  );
