import type { Express, Request } from "express";
import { route, fail } from "../../../packages/shared/http.ts";
import { call } from "./dependencies.ts";
const cookie = (token: string, clear = false) =>
  "cardo_session=" +
  token +
  "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
  (clear ? 0 : 2592000) +
  (process.env.COOKIE_SECURE === "true" ? "; Secure" : "");
function tokenOf(req: Request) {
  const bearer = req.header("Authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return (
    String(req.header("Cookie") || "").match(
      /(?:^|;\s*)cardo_session=([a-f0-9]{64})/,
    )?.[1] || ""
  );
}
export function registerAuth(app: Express, customerUrl: string) {
  for (const action of ["register", "login", "logout"])
    app.post(
      "/api/auth/" + action,
      route(async (req, res) => {
        const body = action === "logout" ? { token: tokenOf(req) } : req.body;
        const response = await call(
          customerUrl + "/api/auth/" + action,
          { method: "POST", body: JSON.stringify(body) },
          res.locals.requestId,
        );
        const data = await response.json();
        if (response.ok)
          res.set("Set-Cookie", cookie(data.token || "", action === "logout"));
        res.status(response.status).json(data);
      }),
    );
  app.use("/api", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const token = tokenOf(req);
        if (!token) fail(401, "UNAUTHORIZED", "Войди в аккаунт");
        const response = await call(
          customerUrl + "/internal/session",
          { method: "POST", body: JSON.stringify({ token }) },
          res.locals.requestId,
        );
        if (response.status === 401)
          fail(401, "UNAUTHORIZED", "Войди в аккаунт");
        if (!response.ok)
          fail(
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Сервис временно недоступен. Попробуй ещё раз",
          );
        res.locals.user = await response.json();
      })
      .then(() => next())
      .catch(next);
  });
}
