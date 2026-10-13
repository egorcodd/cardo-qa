import { Router } from "express";
import { context } from "../../../../packages/shared/http.ts";
import { banks } from "../banks.ts";

export function createBanksRoutes() {
  const app = Router();
  app.get("/api/banks", (req, res) => {
    context(req);
    res.json(banks);
  });
  return app;
}
