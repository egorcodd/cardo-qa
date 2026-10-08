const refunds = new Set(["m.orderRefund", "m.hotelRefund", "m.ticketRefund"]);

export function operationVisual(operation) {
  if (operation.cat === "c.exchange") return "exchange";
  if (refunds.has(operation.name) || /^(?:возврат(?:\s|$)|refund(?:\s|$))/i.test(operation.name || "")) return "reset";
  return operation.icon || (Number(operation.amount) > 0 ? "income" : "expense");
}
