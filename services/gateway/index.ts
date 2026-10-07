import { fileURLToPath } from "node:url";
import { listen } from "../../packages/shared/http.ts";
import { createGatewayApp } from "./src/app.ts";
const urls = {
  customer: process.env.CUSTOMER_URL || "http://127.0.0.1:8081",
  banking: process.env.BANKING_URL || "http://127.0.0.1:8082",
  engagement: process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
  rates: process.env.RATES_URL || "http://127.0.0.1:8084",
};
listen(
  createGatewayApp(urls, fileURLToPath(new URL("../../dist", import.meta.url))),
  Number(process.env.PORT || 8942),
);
