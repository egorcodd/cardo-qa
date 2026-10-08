import type { ExternalBankId } from "../../../packages/contracts/index.ts";
export const externalRecipients = [
  {
    bankId: "tbank",
    name: "Анна Иванова",
    phone: "+79990002001",
    cardNumber: "4111111111111111",
  },
  {
    bankId: "tbank",
    name: "Максим Соколов",
    phone: "+79990002002",
    cardNumber: "4000000000000002",
  },
  {
    bankId: "vtb",
    name: "Дмитрий Волков",
    phone: "+79990002003",
    cardNumber: "5555555555554444",
  },
  {
    bankId: "vtb",
    name: "Ольга Смирнова",
    phone: "+79990002004",
    cardNumber: "5105105105105100",
  },
  {
    bankId: "tochka",
    name: "Павел Орлов",
    phone: "+79990002005",
    cardNumber: "4012888888881881",
  },
  {
    bankId: "tochka",
    name: "Елена Морозова",
    phone: "+79990002006",
    cardNumber: "4000000000000069",
  },
  {
    bankId: "revolut",
    name: "София Лебедева",
    phone: "+79990002007",
    cardNumber: "4000000000000077",
  },
  {
    bankId: "revolut",
    name: "Никита Попов",
    phone: "+79990002008",
    cardNumber: "4000000000000085",
  },
  {
    bankId: "wise",
    name: "Дарья Кузнецова",
    phone: "+79990002009",
    cardNumber: "4000000000000093",
  },
  {
    bankId: "wise",
    name: "Артём Васильев",
    phone: "+79990002010",
    cardNumber: "4000000000000101",
  },
  {
    bankId: "sber",
    name: "Ирина Белова",
    phone: "+79990002011",
    cardNumber: "4000000000000218",
  },
  {
    bankId: "sber",
    name: "Сергей Крылов",
    phone: "+79990002012",
    cardNumber: "4000000000000226",
  },
  {
    bankId: "alfa",
    name: "Екатерина Мельникова",
    phone: "+79990002013",
    cardNumber: "4000000000000234",
  },
  {
    bankId: "alfa",
    name: "Андрей Захаров",
    phone: "+79990002014",
    cardNumber: "4000000000000242",
  },
  {
    bankId: "gazprombank",
    name: "Виктор Фёдоров",
    phone: "+79990002015",
    cardNumber: "4000000000000259",
  },
  {
    bankId: "gazprombank",
    name: "Наталья Петрова",
    phone: "+79990002016",
    cardNumber: "4000000000000267",
  },
  {
    bankId: "raiffeisen",
    name: "Михаил Андреев",
    phone: "+79990002017",
    cardNumber: "4000000000000275",
  },
  {
    bankId: "raiffeisen",
    name: "Алиса Романова",
    phone: "+79990002018",
    cardNumber: "4000000000000283",
  },
  {
    bankId: "sovcombank",
    name: "Владимир Егоров",
    phone: "+79990002019",
    cardNumber: "4000000000000291",
  },
  {
    bankId: "sovcombank",
    name: "Ксения Ковалева",
    phone: "+79990002020",
    cardNumber: "4000000000000309",
  },
  {
    bankId: "ozon",
    name: "Иван Громов",
    phone: "+79990002021",
    cardNumber: "4000000000000317",
  },
  {
    bankId: "ozon",
    name: "Полина Зайцева",
    phone: "+79990002022",
    cardNumber: "4000000000000325",
  },
] as const satisfies readonly {
  bankId: ExternalBankId;
  name: string;
  phone: string;
  cardNumber: string;
}[];
export function findExternalRecipient(
  bankId: string,
  type: string,
  value: string,
) {
  return externalRecipients.find(
    (recipient) =>
      recipient.bankId === bankId &&
      (type === "phone"
        ? recipient.phone === value
        : type === "card" && recipient.cardNumber === value),
  );
}
