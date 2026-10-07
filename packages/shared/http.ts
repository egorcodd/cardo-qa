import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
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
export function service(name: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));
  const counts = new Map<string, number>();
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
      const label =
        req.route?.path || req.path.split("/").slice(0, 3).join("/");
      const k = String(label) + "|" + res.statusCode;
      counts.set(k, (counts.get(k) || 0) + 1);
      if (req.path !== "/health" && req.path !== "/metrics")
        console.log(
          JSON.stringify({
            level: "info",
            service: name,
            requestId,
            method: req.method,
            route: label,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - start),
          }),
        );
    });
    next();
  });
  app.get("/metrics", (_req, res) =>
    res.type("text/plain").send(
      [...counts]
        .map(([k, n]) => {
          const [path, status] = k.split("|");
          return (
            'cardo_http_requests_total{service="' +
            name +
            '",route="' +
            path +
            '",status="' +
            status +
            '"} ' +
            n
          );
        })
        .join("\n") + "\n",
    ),
  );
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
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = error instanceof HttpError ? error : null;
      const syntax = error instanceof SyntaxError;
      const status = e?.status || (syntax ? 400 : 500);
      if (status >= 500)
        console.error(
          JSON.stringify({
            level: "error",
            requestId: res.locals.requestId,
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        );
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
        process.exitCode = 0;
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
