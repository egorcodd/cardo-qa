import { decimal } from "../../../packages/shared/validation.ts";
import type { Membership } from "./integrations/membership.ts";
export function transferFee(membership: Membership) {
  const premium =
    membership.premium &&
    membership.expiresAt !== null &&
    Date.parse(membership.expiresAt) > Date.now();
  const fee = premium ? 10000n : 50000n;
  return {
    fee: decimal(fee),
    feeMinor: fee.toString(),
    currency: "RUB",
    plan: premium ? "plus" : "standard",
  };
}
