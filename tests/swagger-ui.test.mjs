import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createGatewayApp } from "../services/gateway/src/app.ts";
import openapi from "../services/gateway/openapi.ts";

test("Swagger loads the canonical specification, groups operations and keeps trace IDs automatic", async (t) => {
  const unused = "http://127.0.0.1:1";
  const app = createGatewayApp({ customer: unused, banking: unused, engagement: unused, rates: unused }, new URL("../dist", import.meta.url).pathname);
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const htmlResponse = await fetch(base + "/api/docs/");
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(html, /<title>Cardo API<\/title>/);
  assert.match(html, /swagger-ui-init.js/);
  assert.match(html, /max-width: 1180px/);
  const scriptResponse = await fetch(base + "/api/docs/swagger-ui-init.js");
  assert.equal(scriptResponse.status, 200);
  let config;
  const window = { location: { search: "", origin: base } };
  const sandbox = { window, SwaggerUIStandalonePreset: {} };
  sandbox.SwaggerUIBundle = (options) => { config = options; return {}; };
  sandbox.SwaggerUIBundle.presets = { apis: {} };
  sandbox.SwaggerUIBundle.plugins = { DownloadUrl: {} };
  vm.runInNewContext(await scriptResponse.text(), sandbox);
  window.onload();
  assert.equal(config.spec, undefined);
  assert.equal(config.url, "/api/openapi.json");
  assert.equal(config.docExpansion, "none");
  assert.equal(config.defaultModelsExpandDepth, 0);
  assert.equal(config.filter, true);
  assert.equal(config.deepLinking, true);
  assert.equal(config.persistAuthorization, false);
  assert.equal(config.validatorUrl, null);
  const specResponse = await fetch(base + config.url);
  assert.equal(specResponse.status, 200);
  assert.deepEqual(await specResponse.json(), JSON.parse(JSON.stringify(openapi)));
  const automatic = await fetch(base + "/api/health");
  assert.match(automatic.headers.get("X-Request-Id"), /^[0-9a-f-]{36}$/);
  const supplied = await fetch(base + "/api/health", { headers: { "X-Request-Id": "swagger-trace-check" } });
  assert.equal(supplied.headers.get("X-Request-Id"), "swagger-trace-check");
});
