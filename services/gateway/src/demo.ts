import { upstream } from "../../../packages/shared/http.ts";
import type { ServiceUrls } from "./dependencies.ts";
export async function seedDemoAccounts(urls: ServiceUrls) {
  if (process.env.DEMO_ACCOUNTS_ENABLED === "false") return;
  for (const key of ["plus", "standard"]) {
    const response = await upstream(urls.customer + "/internal/demo-users", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    if (!response.ok)
      throw new Error("Demo customer provisioning failed: " + response.status);
    const user = await response.json();
    for (const [service, body] of [
      ["banking", { userId: user.id, name: user.name, demo: true }],
      ["engagement", { userId: user.id, premium: key === "plus", demo: true }],
    ] as const) {
      const result = await upstream(urls[service] + "/internal/provision", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!result.ok)
        throw new Error(
          "Demo " + service + " provisioning failed: " + result.status,
        );
    }
  }
}
