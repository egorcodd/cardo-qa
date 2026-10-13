export function pushBody(kind: string, body: string) {
  if (kind !== "transfer_incoming") return body;
  return body.replace(/\d(?:[\d\s\u00a0\u202f]*\d)?(?:[,.]\d{1,2})?(?=\s*[₽$€])/, (amount) => {
    const value = Number(amount.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
    return Number.isInteger(value) && value % 100 === 0
      ? (amount.includes(",") ? amount : amount + ",") + "0000000000000000"
      : amount;
  });
}
