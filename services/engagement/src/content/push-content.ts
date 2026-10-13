import { pushBody } from "../push-body.ts";
import { rewards } from "../wallet.ts";

function person(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2 || !/^\p{L}/u.test(parts[1])) return parts.join(" ");
  return parts[0] + " " + Array.from(parts[1])[0].toLocaleUpperCase("ru-RU") + ".";
}

function money(value: string, kind: string, english: boolean) {
  const shown = pushBody(kind, value);
  if (!english) return shown;
  const match = /^(\d[\d\s\u00a0\u202f]*)(?:,(\d+))?\s*([₽$€])$/.exec(shown);
  if (!match) return shown;
  const integer = Number(match[1].replace(/\s/g, "")).toLocaleString("en-US");
  const amount = integer + (match[2] ? "." + match[2] : "");
  return match[3] === "₽" ? amount + " ₽" : match[3] + amount;
}

export function pushContent(kind: string, title: string, body: string, language: string) {
  const english = language === "en";
  const incoming = /^Зачислено (.+?)\. Отправитель: (.+)\.$/.exec(body);
  if (kind === "transfer_incoming" && incoming)
    return {
      title: (english ? "Received " : "Получено ") + money(incoming[1], kind, english),
      body: (english ? "From " : "От: ") + person(incoming[2]),
    };

  const outgoing = /^Отправлено (.+?)\. Получатель: (.+)\.$/.exec(body);
  if (kind === "transfer" && outgoing)
    return {
      title: (english ? "Sent " : "Переведено ") + money(outgoing[1], kind, english),
      body: (english ? "To: " : "Получатель: ") + person(outgoing[2]),
    };

  const external = /^Отправлено (.+?)\. Банк: (.+?)\. (.+)\.$/.exec(body);
  if (kind === "transfer" && external)
    return {
      title: (english ? "Sent " : "Переведено ") + money(external[1], kind, english),
      body: external[2] + " · " + external[3],
    };

  const topUp = /^На счёт зачислено (.+)\.$/.exec(body);
  if (kind === "top_up" && topUp)
    return { title: (english ? "Account topped up by " : "Счёт пополнен на ") + money(topUp[1], kind, english), body: "" };

  if (kind === "reward")
    return { title: english ? "Reward received" : "Награда получена", body: english ? rewards.find(reward => reward.title === body)?.titleEn || body : body };

  return {
    title: english ? ({ transfer: "Transfer complete", transfer_incoming: "Money received", top_up: "Account topped up", reminder: "Reminder", test: "Cardo notification" } as Record<string, string>)[kind] || title : title,
    body: pushBody(kind, body),
  };
}
