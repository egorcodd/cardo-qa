import { fileURLToPath } from "node:url";
import { listen } from "../../packages/shared/http.ts";
import { createGatewayApp } from "./src/app.ts";
import { seedDemoAccounts } from "./src/demo.ts";
const urls = {
  customer: process.env.CUSTOMER_URL || "http://127.0.0.1:8081",
  banking: process.env.BANKING_URL || "http://127.0.0.1:8082",
  engagement: process.env.ENGAGEMENT_URL || "http://127.0.0.1:8083",
  rates: process.env.RATES_URL || "http://127.0.0.1:8084",
};

async function prepareDemos() {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await seedDemoAccounts(urls);
      console.log(
        JSON.stringify({
          level: "info",
          service: "gateway",
          message: "Demo accounts ready",
        }),
      );
      return;
    } catch (error) {
      if (attempt === 19) {
        console.error(
          JSON.stringify({
            level: "error",
            service: "gateway",
            message:
              error instanceof Error
                ? error.message
                : "Demo provisioning failed",
          }),
        );
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
await prepareDemos();
listen(
  createGatewayApp(urls, fileURLToPath(new URL("../../dist", import.meta.url))),
  Number(process.env.PORT || 8942),
);
