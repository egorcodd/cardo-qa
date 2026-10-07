import type { Express } from "express";
import { fail } from "../../../packages/shared/http.ts";
export function applySecurity(app: Express) {
  const attempts = new Map<string, { count: number; until: number }>();
  app.use("/api/auth", (req, res, next) => {
    const key = req.ip || "local",
      now = Date.now(),
      old = attempts.get(key);
    const item =
      old && old.until > now ? old : { count: 0, until: now + 60000 };
    item.count++;
    attempts.set(key, item);
    if (item.count > 30)
      return res.status(429).json({
        error: {
          code: "TOO_MANY_ATTEMPTS",
          message: "Слишком много попыток. Подожди минуту",
        },
      });
    if (attempts.size > 1000)
      for (const [ip, value] of attempts)
        if (value.until < now) attempts.delete(ip);
    next();
  });
  app.use("/api", (req, _res, next) => {
    try {
      const origin = req.header("Origin");
      if (origin && new URL(origin).host !== req.header("Host"))
        fail(403, "ORIGIN_REJECTED", "Запрос с другого сайта отклонён");
      next();
    } catch (error) {
      next(error);
    }
  });
}
