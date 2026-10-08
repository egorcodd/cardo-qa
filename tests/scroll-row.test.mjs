import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../apps/web/src/components/ScrollRow.jsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function target() {
  const listeners = new Map();
  return {
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => listeners.get(type)?.delete(handler),
    dispatch(type, props = {}) {
      const event = {
        pointerId: 1, pointerType: "mouse", button: 0, pageX: 100, detail: 1,
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...props,
      };
      for (const handler of listeners.get(type) || []) handler(event);
      return event;
    },
    listenerCount: () => [...listeners.values()].reduce((sum, items) => sum + items.size, 0),
  };
}

function rowHarness(overflow = true) {
  const row = target(), browser = target(), effects = [], captured = new Set();
  row.scrollWidth = overflow ? 600 : 100;
  row.clientWidth = 100;
  let position = overflow ? 80 : 0;
  Object.defineProperty(row, "scrollLeft", {
    get: () => position,
    set: (value) => { position = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, value)); },
  });
  row.setPointerCapture = (id) => captured.add(id);
  row.hasPointerCapture = (id) => captured.has(id);
  row.releasePointerCapture = (id) => captured.delete(id);
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window: browser,
    require(name) {
      if (name === "react") return { useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect) };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  const rendered = exports.default({ children: null });
  rendered.props.ref.current = row;
  const cleanups = effects.map((effect) => effect());
  return { row, browser, captured, cleanup: () => cleanups.forEach((cleanup) => cleanup()) };
}

test("a row without overflow does not suppress clicks after mouse movement", () => {
  const { row, browser, cleanup } = rowHarness(false);
  row.dispatch("pointerdown");
  const move = browser.dispatch("pointermove", { pageX: 60 });
  browser.dispatch("pointerup");
  const click = row.dispatch("click");
  assert.equal(move.prevented, false);
  assert.equal(click.prevented, false);
  assert.equal(row.scrollLeft, 0);
  cleanup();
});

test("mouse drags start at eight pixels and suppress only their resulting click", () => {
  const { row, browser, captured, cleanup } = rowHarness();
  row.dispatch("pointerdown");
  const slight = browser.dispatch("pointermove", { pageX: 107 });
  assert.equal(row.scrollLeft, 80);
  assert.equal(slight.prevented, false);
  const drag = browser.dispatch("pointermove", { pageX: 90 });
  assert.equal(row.scrollLeft, 90);
  assert.equal(drag.prevented, true);
  assert.equal(captured.has(1), true);
  browser.dispatch("pointerup");
  assert.equal(captured.size, 0);
  assert.equal(row.dispatch("click").prevented, true);
  row.dispatch("pointerdown");
  browser.dispatch("pointerup");
  assert.equal(row.dispatch("click").prevented, false);
  cleanup();
});

test("touch scrolling and taps remain native without pointer capture", () => {
  const { row, browser, captured, cleanup } = rowHarness();
  row.dispatch("pointerdown", { pointerType: "touch" });
  const move = browser.dispatch("pointermove", { pointerType: "touch", pageX: 50 });
  browser.dispatch("pointerup", { pointerType: "touch" });
  assert.equal(move.prevented, false);
  assert.equal(row.scrollLeft, 80);
  assert.equal(captured.size, 0);
  assert.equal(row.dispatch("click").prevented, false);
  cleanup();
});

test("pointer cancellation resets dragging and leaves the next selection usable", () => {
  const { row, browser, captured, cleanup } = rowHarness();
  row.dispatch("pointerdown");
  browser.dispatch("pointermove", { pageX: 90 });
  browser.dispatch("pointercancel");
  assert.equal(captured.size, 0);
  const afterCancel = browser.dispatch("pointermove", { pageX: 40 });
  assert.equal(afterCancel.prevented, false);
  assert.equal(row.scrollLeft, 90);
  assert.equal(row.dispatch("click").prevented, false);
  cleanup();
});

test("keyboard selections survive a drag and cleanup removes every listener", () => {
  const { row, browser, cleanup } = rowHarness();
  row.dispatch("pointerdown");
  browser.dispatch("pointermove", { pageX: 90 });
  browser.dispatch("pointerup");
  assert.equal(row.dispatch("click", { detail: 0 }).prevented, false);
  cleanup();
  assert.equal(row.listenerCount(), 0);
  assert.equal(browser.listenerCount(), 0);
});
