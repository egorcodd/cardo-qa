import {
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import {
  service,
  route,
  internal,
  context,
  errors,
  fail,
  listen,
} from "../../packages/shared/http.ts";
import { database, transaction, migrate } from "../../packages/shared/db.ts";
import * as validate from "../../packages/shared/validation.ts";
const scrypt = promisify(scryptCallback);
const pool = database("customer");
await migrate(pool, new URL("./migration.sql", import.meta.url));
const app = service("customer");
app.get(
  "/health",
  route(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "customer" });
  }),
);
app.use(internal);
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const publicUser = (u: Record<string, unknown>) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  initial: String(u.name).slice(0, 1).toUpperCase(),
  plan: "Cardo Плюс",
  language: u.language,
  theme: u.theme,
  mainCardId: u.main_card_id,
});
async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO customer.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [hashToken(token), userId],
  );
  return token;
}
app.post(
  "/api/auth/register",
  route(async (req, res) => {
    const p = validate.phone(req.body.phone),
      pw = validate.password(req.body.password),
      n = validate.name(req.body.name || "Клиент Cardo");
    if (
      req.body.confirmPassword !== undefined &&
      pw !== req.body.confirmPassword
    )
      fail(422, "PASSWORD_MISMATCH", "Пароли не совпадают");
    const salt = randomBytes(16).toString("hex");
    const key = (await scrypt(pw, salt, 64)) as Buffer;
    let user;
    try {
      user = (
        await pool.query(
          "INSERT INTO customer.users(id,phone,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
          [randomUUID(), p, n, salt + ":" + key.toString("hex")],
        )
      ).rows[0];
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        fail(
          409,
          "PHONE_EXISTS",
          "Этот номер уже зарегистрирован. Войди в аккаунт",
        );
      throw e;
    }
    res
      .status(201)
      .json({ user: publicUser(user), token: await session(user.id) });
  }),
);
app.post(
  "/api/auth/login",
  route(async (req, res) => {
    const p = validate.phone(req.body.phone),
      pw = validate.password(req.body.password);
    const user = (
      await pool.query("SELECT * FROM customer.users WHERE phone=$1", [p])
    ).rows[0];
    const [salt, expected] = (
      user?.password_hash || "0123456789abcdef:" + "00".repeat(64)
    ).split(":");
    const key = (await scrypt(pw, salt, 64)) as Buffer;
    if (!user || !timingSafeEqual(key, Buffer.from(expected, "hex")))
      fail(401, "BAD_CREDENTIALS", "Неверный номер или пароль");
    res.json({ user: publicUser(user), token: await session(user.id) });
  }),
);
app.post(
  "/api/auth/logout",
  route(async (req, res) => {
    await pool.query("DELETE FROM customer.sessions WHERE token_hash=$1", [
      hashToken(String(req.body.token || "")),
    ]);
    res.json({ ok: true });
  }),
);
app.post(
  "/internal/session",
  route(async (req, res) => {
    const token = String(req.body.token || "");
    if (!/^[a-f0-9]{64}$/.test(token))
      fail(401, "UNAUTHORIZED", "Войди в аккаунт");
    const u = (
      await pool.query(
        "SELECT u.* FROM customer.users u JOIN customer.sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [hashToken(token)],
      )
    ).rows[0];
    if (!u) fail(401, "UNAUTHORIZED", "Войди в аккаунт");
    res.json(publicUser(u));
  }),
);
app.get(
  "/api/profile",
  route(async (req, res) => {
    const u = (
      await pool.query("SELECT * FROM customer.users WHERE id=$1", [
        context(req),
      ])
    ).rows[0];
    if (!u) fail(404, "NOT_FOUND", "Профиль не найден");
    res.json(publicUser(u));
  }),
);
app.patch(
  "/api/profile",
  route(async (req, res) => {
    const n = validate.name(req.body.name);
    const u = (
      await pool.query(
        "UPDATE customer.users SET name=$2 WHERE id=$1 RETURNING *",
        [context(req), n],
      )
    ).rows[0];
    res.json(publicUser(u));
  }),
);
app.get(
  "/api/settings",
  route(async (req, res) => {
    const u = (
      await pool.query("SELECT * FROM customer.users WHERE id=$1", [
        context(req),
      ])
    ).rows[0];
    res.json(publicUser(u));
  }),
);
app.put(
  "/api/settings",
  route(async (req, res) => {
    const { language, theme, mainCardId } = req.body;
    if (language && !["ru", "en"].includes(language))
      fail(422, "INVALID_LANGUAGE", "Выбери язык");
    if (theme && !["light", "dark", "system"].includes(theme))
      fail(422, "INVALID_THEME", "Выбери тему");
    if (mainCardId && !/^[\w-]{1,60}$/.test(mainCardId))
      fail(422, "INVALID_CARD", "Некорректная карта");
    const u = (
      await pool.query(
        "UPDATE customer.users SET language=coalesce($2,language),theme=coalesce($3,theme),main_card_id=coalesce($4,main_card_id) WHERE id=$1 RETURNING *",
        [context(req), language || null, theme || null, mainCardId || null],
      )
    ).rows[0];
    res.json(publicUser(u));
  }),
);
errors(app);
listen(app, Number(process.env.PORT || 8081));
