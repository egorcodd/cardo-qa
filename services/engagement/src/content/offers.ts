import { createHash } from "node:crypto";
import type { OfferTemplate } from "./offer-template.ts";
import { bankingOffers } from "./offers-banking.ts";
import { membershipOffers } from "./offers-membership.ts";
import { currencyOffers } from "./offers-currency.ts";

const featuredOffers = [
  {
    id: "original-01",
    title: "Cardo Плюс для ваших переводов",
    body: "Оформите Cardo Плюс: комиссия за перевод составит 100 ₽ вместо 500 ₽. Месяц подписки доступен за 100 баллов.",
    url: "/rewards",
  },
  {
    id: "original-02",
    title: "Пять баллов за отправленный перевод",
    body: "За каждый выполненный исходящий перевод начисляем 5 баллов. В разделе наград их можно обменять на месяц Cardo Плюс.",
    url: "/rewards",
  },
  {
    id: "original-03",
    title: "Три валюты в одном приложении",
    body: "Рубли, доллары и евро доступны на отдельных картах Cardo. Балансы и реквизиты собраны в разделе «Карты».",
    url: "/cards",
  },
  {
    id: "original-04",
    title: "Пополните карту в Cardo",
    body: "Выберите сумму и рублёвую карту на главной странице. Пополнение появится на балансе и в истории операций.",
    url: "/",
  },
  {
    id: "original-05",
    title: "Обмен без отдельной комиссии",
    body: "Меняйте рубли, доллары и евро между своими счетами Cardo. Курс и сумма зачисления видны до подтверждения обмена.",
    url: "/exchange",
  },
  {
    id: "original-06",
    title: "Деньги близким через Cardo",
    body: "Для перевода другому клиенту Cardo укажите его телефон или номер карты. Имя получателя появится до отправки денег.",
    url: "/send",
  },
] satisfies readonly OfferTemplate[];

export const offerTemplates: readonly OfferTemplate[] = [
  ...featuredOffers,
  ...bankingOffers,
  ...membershipOffers,
  ...currencyOffers,
];
const canonical = [...offerTemplates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const version = createHash("sha256").update(canonical.map(offer => offer.id).join("|")).digest("hex");

function orderFor(user: string) {
  const order = [...canonical];
  let seed = createHash("sha256").update(version + ":" + user).digest().readUInt32BE(0) || 1;
  for (let index = order.length - 1; index > 0; index--) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const target = (seed >>> 0) % (index + 1);
    [order[index], order[target]] = [order[target], order[index]];
  }
  return order;
}

export function offerForSequence(user: string, sequence: string | bigint): OfferTemplate {
  const position = BigInt(sequence);
  if (position < 0n) throw new RangeError("Offer sequence must be non-negative");
  const count = BigInt(canonical.length);
  const order = orderFor(user);
  return order[Number(position % count)];
}
