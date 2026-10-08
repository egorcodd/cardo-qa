import { randomBytes, scrypt as scryptCallback, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
export const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = (u: Record<string, unknown>) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  initial: String(u.name).slice(0, 1).toUpperCase(),
  plan: "Cardo",
  isDemo: Boolean(u.demo_key),
  language: u.language,
  theme: u.theme,
  mainCardId: u.main_card_id,
  email: u.email,
  birth:
    u.birth instanceof Date
      ? [
          u.birth.getFullYear(),
          String(u.birth.getMonth() + 1).padStart(2, "0"),
          String(u.birth.getDate()).padStart(2, "0"),
        ].join("-")
      : u.birth || "",
  avatarTone: u.avatar_tone,
  hideBalance: u.hide_balance,
  createdAt: u.created_at,
  passwordChangedAt: u.password_changed_at,
});
export async function session(pool: Pool, userId: string) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO customer.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [hashToken(token), userId],
  );
  return token;
}
