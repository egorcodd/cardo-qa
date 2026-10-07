import express from "express";
import swaggerUi from "swagger-ui-express";
import path from "node:path";
import { service, route, errors } from "../../../packages/shared/http.ts";
import openapi from "../openapi.ts";
import { applySecurity } from "./security.ts";
import { registerAuth } from "./auth.ts";
import { registerProxy } from "./proxy.ts";
import type { ServiceUrls } from "./dependencies.ts";
export function createGatewayApp(urls: ServiceUrls, dist: string) {
  const app = service("gateway");
  app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
  app.get(
    "/health",
    route(async (_req, res) => {
      const checks = await Promise.all(
        Object.entries(urls).map(async ([name, url]) => {
          try {
            const response = await fetch(url + "/health", {
              signal: AbortSignal.timeout(2000),
            });
            return { name, ok: response.ok };
          } catch {
            return { name, ok: false };
          }
        }),
      );
      const ok = checks.every((check) => check.ok);
      res
        .status(ok ? 200 : 503)
        .json({ status: ok ? "ok" : "degraded", services: checks });
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", version: "2.0.0" }),
  );
  app.get("/api/openapi.json", (_req, res) => res.json(openapi));
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: "Cardo API" }),
  );
  applySecurity(app);
  registerAuth(app, urls.customer);
  registerProxy(app, urls);
  app.use(
    express.static(dist, {
      setHeaders(res, file) {
        if (
          file.endsWith("sw.js") ||
          file.endsWith("index.html") ||
          file.endsWith("manifest.webmanifest")
        )
          res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  errors(app);
  return app;
}
