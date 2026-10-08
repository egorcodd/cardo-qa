import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { bankAmount } from "../services/engagement/src/content/bank-amount.ts";
import { notification } from "../services/engagement/src/notifications.ts";
import { offerTemplates } from "../services/engagement/src/content/offers.ts";

const paths = [...new Set(offerTemplates.map(offer => offer.url)), "/history/operation-123", "/cards/card-456"];
const unsafe = ["https://other.example/exchange", "//other.example/send", "javascript:alert(1)", "/exchange/unknown", "/send?external=true", "/history/../settings", "/profile#external"];
const swSource = await readFile(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");

test("Bank amounts use Russian currency notation without losing cents", () => {
  assert.equal(bankAmount("1500.50", "RUB"), "1\u00a0500,5\u00a0₽");
  assert.equal(bankAmount("20.00", "RUB"), "20\u00a0₽");
  assert.equal(bankAmount("0.01", "RUB"), "0,01\u00a0₽");
  assert.equal(bankAmount("1234567.89", "USD"), "1\u00a0234\u00a0567,89\u00a0$");
  assert.equal(bankAmount("99.99", "EUR"), "99,99\u00a0€");
});

test("Saved notifications keep supported bank destinations and reject unsafe URLs", async () => {
  for (const path of [...paths, ...unsafe]) {
    const queries = [];
    const client = { async query(sql, values) { queries.push({ sql, values }); return { rowCount: 0 }; } };
    const result = await notification(client, "recipient", "offer", "Cardo Плюс", "Комиссия 100 ₽ вместо 500 ₽.", path);
    assert.equal(queries[0].values[5], unsafe.includes(path) ? "/notifications" : path);
    assert.equal(queries[0].values[6], "offers");
    assert.equal(queries[0].values[3], "Cardo Плюс");
    assert.equal(result.pushQueued, 0);
    assert.equal(queries.length, 2);
  }
});

function worker(hasWindow) {
  const handlers = new Map(), shown = [], navigated = [], opened = [], messages = [];
  let focused = 0, closed = 0;
  const ownWindow = {
    url: "https://cardo.example/history",
    async navigate(url) { navigated.push(url); },
    async focus() { focused += 1; },
    postMessage(data) { messages.push(data); },
  };
  const otherWindow = {
    url: "https://other.example/",
    async navigate() { throw new Error("Unrelated window navigated"); },
    postMessage() { throw new Error("Unrelated window notified"); },
  };
  const self = {
    location: { origin: "https://cardo.example" },
    addEventListener(name, handler) { handlers.set(name, handler); },
    registration: { async showNotification(title, options) { shown.push({ title, options }); } },
    clients: {
      async matchAll() { return hasWindow ? [otherWindow, ownWindow] : [otherWindow]; },
      async openWindow(url) { opened.push(url); },
    },
  };
  vm.runInNewContext(swSource, { self, URL });
  async function dispatch(name, event) {
    const waits = [];
    handlers.get(name)({ ...event, waitUntil(promise) { waits.push(promise); } });
    await Promise.all(waits);
  }
  return {
    shown, navigated, opened, messages,
    get focused() { return focused; },
    get closed() { return closed; },
    async push(url) {
      await dispatch("push", { data: { json: () => ({ title: "Предложение Cardo", body: "Условия доступны в приложении.", url, userId: "recipient", notificationId: "notice" }) } });
    },
    async click() {
      await dispatch("notificationclick", { notification: { data: shown.at(-1).options.data, close() { closed += 1; } } });
    },
  };
}

test("PWA push clicks open the matching bank screen and refresh an existing window", async () => {
  for (const path of [...paths, ...unsafe]) {
    const instance = worker(true), target = unsafe.includes(path) ? "/notifications" : path;
    await instance.push(path);
    assert.equal(instance.shown[0].options.data.url, target);
    assert.equal(instance.messages[0].url, target);
    assert.equal(instance.messages[0].userId, "recipient");
    await instance.click();
    assert.deepEqual(instance.navigated, ["https://cardo.example" + target]);
    assert.equal(instance.focused, 1);
    assert.equal(instance.closed, 1);
    assert.equal(instance.messages.length, 2);
    assert.deepEqual(instance.opened, []);
  }
});

test("PWA push clicks open a new bank window when the application is closed", async () => {
  for (const path of ["/exchange", "/rewards", "https://other.example/"]) {
    const instance = worker(false);
    await instance.push(path);
    await instance.click();
    assert.deepEqual(instance.opened, ["https://cardo.example" + (path.startsWith("https:") ? "/notifications" : path)]);
    assert.deepEqual(instance.navigated, []);
    assert.equal(instance.closed, 1);
  }
});
