import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { registry, requests, duration, routeLabel } from "./metrics.ts";
import { log, flushLogs } from "./telemetry.ts";
export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new HttpError(status, code, message, details);
}
const secret = process.env.INTERNAL_TOKEN || "cardo-local-internal";
export function internal(req: Request, res: Response, next: NextFunction) {
  const received = req.header("X-Internal-Token") || "";
  if (
    Buffer.byteLength(received) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(secret))
  )
    return res
      .status(403)
      .json({ error: { code: "FORBIDDEN", message: "Доступ закрыт" } });
  next();
}
export function context(req: Request): string {
  const id = req.header("X-User-Id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    fail(401, "UNAUTHORIZED", "Войди в аккаунт");
  return id;
}
export function service(name: string, jsonLimit = "24kb") {
  const app = express();
  app.disable("x-powered-by");
  app.locals.service = name;
  app.use((req, res, next) => {
    const start = performance.now();
    const supplied = req.header("X-Request-Id");
    const requestId =
      supplied && /^[A-Za-z0-9-]{1,80}$/.test(supplied)
        ? supplied
        : randomUUID();
    res.locals.requestId = requestId;
    res.set("X-Request-Id", requestId);
    res.on("finish", () => {
      if (req.path === "/health" || req.path === "/metrics") return;
      const label = routeLabel(app.locals.observationRoute?.(req.originalUrl) || String(req.route?.path || "/unknown"));
      const elapsed = performance.now() - start;
      requests.inc({ service: name, method: req.method, route: label, status: String(res.statusCode) });
      duration.observe({ service: name, method: req.method, route: label }, elapsed / 1000);
      log(name, "info", "http.request", { requestId, method: req.method, route: label, status: res.statusCode, durationMs: Math.round(elapsed) });
    });
    next();
  });
  app.use(express.json({ limit: jsonLimit }));
  app.get("/metrics", (req, res, next) => {
    if (req.header("Authorization") === "Bearer " + secret) return next();
    internal(req, res, next);
  }, route(async (_req, res) => { res.type(registry.contentType).send(await registry.metrics()); }));
  return app;
}
export function errors(app: ReturnType<typeof express>) {
  app.use((_req, res) =>
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Не найдено",
        requestId: res.locals.requestId,
      },
    }),
  );
  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      const e = error instanceof HttpError ? error : null;
      const syntax = error instanceof SyntaxError;
      const status = e?.status || (syntax ? 400 : 500);
      if (status >= 500)
        log(app.locals.service, "error", "http.error", { requestId: res.locals.requestId, method: req.method, route: app.locals.observationRoute?.(req.originalUrl) || String(req.route?.path || "/unknown"), status, errorCode: e?.code || "INTERNAL_ERROR" });
      res.status(status).json({
        error: {
          code: e?.code || (syntax ? "INVALID_JSON" : "INTERNAL_ERROR"),
          message:
            e?.message ||
            (syntax ? "Некорректный JSON" : "Сервис временно недоступен"),
          requestId: res.locals.requestId,
          ...(e?.details ? { details: e.details } : {}),
        },
      });
    },
  );
}
export async function upstream(
  url: string,
  options: RequestInit = {},
  requestId?: string,
) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": secret,
      ...(requestId ? { "X-Request-Id": requestId } : {}),
      ...options.headers,
    },
  });
  return response;
}
export function listen(
  app: ReturnType<typeof express>,
  port: number,
  cleanup: () => Promise<void> = async () => {},
) {
  const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
    console.log(JSON.stringify({ level: "info", message: "listening", port })),
  );
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(async () => {
      try {
        await cleanup();
        await flushLogs();
        process.exitCode ||= 0;
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return server;
}
