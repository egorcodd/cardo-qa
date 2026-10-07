import { fail } from "./http.ts";
export function phone(value: unknown): string {
  if (typeof value !== "string" || !/^[+\d ()-]+$/.test(value))
    fail(422, "INVALID_PHONE", "Введи российский мобильный номер");
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = "7" + digits;
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (!/^79\d{9}$/.test(digits))
    fail(422, "INVALID_PHONE", "Номер должен содержать +7 и 10 цифр");
  return "+" + digits;
}
export function password(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 72 ||
    !/\p{L}/u.test(value) ||
    !/\d/.test(value) ||
    /\s/.test(value)
  )
    fail(
      422,
      "INVALID_PASSWORD",
      "Пароль: 8–72 символа, буква и цифра, без пробелов",
    );
  return value;
}
export function name(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 2 ||
    value.trim().length > 60 ||
    !/^[\p{L}\p{M} '\-]+$/u.test(value.trim())
  )
    fail(422, "INVALID_NAME", "Имя: от 2 до 60 букв");
  return value.trim().replace(/ +/g, " ");
}
export function minor(value: unknown): bigint {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(raw))
    fail(
      422,
      "INVALID_AMOUNT",
      "Введи сумму, не больше двух знаков после точки",
    );
  const [whole, part = ""] = raw.split(".");
  const result = BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
  if (result <= 0n)
    fail(422, "INVALID_AMOUNT", "Сумма должна быть больше нуля");
  return result;
}
export function decimal(value: bigint | string): string {
  const n = BigInt(value);
  const a = n < 0n ? -n : n;
  return (
    (n < 0n ? "-" : "") +
    String(a / 100n) +
    "." +
    String(a % 100n).padStart(2, "0")
  );
}
