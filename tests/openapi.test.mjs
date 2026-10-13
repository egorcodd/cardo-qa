import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import SwaggerParser from "@apidevtools/swagger-parser";
import openapi from "../services/gateway/openapi.ts";

test("OpenAPI is a valid specification with unique operation IDs", async () => {
  await SwaggerParser.validate(JSON.parse(JSON.stringify(openapi)));
  const ids = Object.values(openapi.paths).flatMap((item) => Object.values(item).map((operation) => operation.operationId));
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.every(Boolean));
});

test("OpenAPI covers every public route and excludes private service routes", () => {
  const root = path.resolve(import.meta.dirname, "../services");
  const files = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  );
  const implemented = new Set();
  const methods = ["get", "post", "put", "patch", "delete"];
  for (const file of files(root).filter((file) => file.endsWith(".ts") && !file.includes(path.sep + "docs" + path.sep) && !file.endsWith("openapi.ts"))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const raw = node.arguments[0].text;
        if (raw.startsWith("/api/") && !["/api/openapi.json", "/api/docs"].includes(raw)) {
          let verbs = [];
          if (ts.isPropertyAccessExpression(node.expression) && methods.includes(node.expression.name.text)) verbs = [node.expression.name.text];
          if (ts.isElementAccessExpression(node.expression) && node.expression.argumentExpression?.getText(source) === "method") {
            let parent = node.parent;
            while (parent && !ts.isForOfStatement(parent)) parent = parent.parent;
            if (parent) {
              const array = ts.isAsExpression(parent.expression) ? parent.expression.expression : parent.expression;
              if (ts.isArrayLiteralExpression(array)) verbs = array.elements.filter(ts.isStringLiteral).map((item) => item.text);
            }
          }
          const route = raw.slice(4).replace(/:([A-Za-z][A-Za-z0-9]*)/g, "{$1}");
          for (const method of verbs) implemented.add(method + " " + route);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const documented = new Set(Object.entries(openapi.paths).flatMap(([route, item]) => Object.keys(item).map((method) => method + " " + route)));
  assert.deepEqual([...documented].sort(), [...implemented].sort());
  assert.ok(implemented.size > 35);
  assert.ok([...documented].every((route) => !route.includes("/internal/") && !route.includes("/metrics")));
});

test("financial documentation preserves currency, fee and idempotency contracts", () => {
  const spec = openapi.paths;
  assert.deepEqual(spec["/transfer/fee"].get.parameters.find((item) => item.name === "currency").schema.enum, ["RUB", "USD", "EUR"]);
  assert.deepEqual(spec["/transfer"].post.requestBody.content["application/json"].schema.required, ["cardId", "recipientId", "amount"]);
  assert.equal(spec["/transfer"].post.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/TransferResult");
  for (const route of ["/transfer", "/top-ups", "/exchange"]) {
    const key = spec[route].post.parameters.find((item) => item.name === "Idempotency-Key");
    assert.equal(key.required, true);
    assert.match(route === "/exchange" ? "ex-example-12345678" : "example-12345678", new RegExp(key.schema.pattern));
  }
  const fees = spec["/transfer/fee"].get.responses["200"].content["application/json"].examples;
  assert.equal(fees.standardUSD.value.fee, "5.00");
  assert.equal(fees.plusEUR.value.feeMinor, "100");
  assert.equal(fees.standardRUB.value.fee, "500.00");
  assert.ok(spec["/auth/register"].post.responses["201"]);
  assert.equal(spec["/auth/register"].post.responses["200"], undefined);
  assert.equal(spec["/cards"].get.responses["201"], undefined);
  assert.equal(spec["/recipients/resolve"].post.requestBody.content["application/json"].examples.cardoEur.value.currency, "EUR");
});

test("documentation has no tutorial introduction and describes every successful response", () => {
  assert.equal(openapi.info.description, undefined);
  const declaredTags = new Set(openapi.tags.map((tag) => tag.name));
  for (const [path, item] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      assert.ok(operation.tags.every((tag) => declaredTags.has(tag)), method + " " + path);
      assert.ok(!(operation.parameters || []).some((parameter) => parameter.name === "X-Request-Id"));
      for (const [status, response] of Object.entries(operation.responses)) {
        assert.ok(response.headers["X-Request-Id"]);
        assert.ok(response.content?.["application/json"]?.schema, method + " " + path + " / " + status);
      }
    }
  }
  for (const path of ["/auth/logout", "/rewards/{id}/claim", "/notifications/{id}/read", "/notifications/test"]) {
    const operation = Object.values(openapi.paths[path])[0];
    assert.equal(operation.requestBody, undefined, path);
  }
  const reminder = openapi.paths["/reminders"].post;
  assert.deepEqual(reminder.requestBody.content["application/json"].schema.required, ["message", "scheduledAt"]);
  assert.ok(reminder.responses["200"]);
  assert.ok(reminder.responses["201"]);
});
