import type { PoolClient } from "pg";
import type { Pool } from "pg";
export const rewards = [
  {
    id: "plus",
    title: "Месяц Cardo Плюс",
    titleEn: "One month of Cardo Plus",
    cost: 100,
    description: "Дополнительные возможности аккаунта",
  },
  {
    id: "cashback",
    title: "Повышенный кешбэк",
    titleEn: "Extra cashback",
    cost: 150,
    description: "Бонус за активность в Cardo",
  },
  {
    id: "travel",
    title: "Бонус путешественника",
    titleEn: "Travel bonus",
    cost: 250,
    description: "Награда за регулярные переводы",
  },
];
export async function ensure(
  pool: Pool,
  user: string,
  c: PoolClient | Pool = pool,
) {
  await c.query(
    "INSERT INTO engagement.wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user],
  );
}
