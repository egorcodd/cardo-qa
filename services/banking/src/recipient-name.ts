export function shortRecipientName(value: string) {
  const parts = value.trim().split(/\s+/);
  if (
    parts.length < 2 ||
    !/^\p{L}/u.test(parts[1]) ||
    /^(Получатель|Перевод) (в |· )/.test(value)
  )
    return value.trim();
  return parts[0] + " " + [...parts[1]][0].toLocaleUpperCase("ru-RU") + ".";
}
