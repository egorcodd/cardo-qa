import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CARDO_NETWORK_SOURCE || fileURLToPath(new URL('..', import.meta.url));
const source = (file) => readFileSync(path.join(root, file), 'utf8');

test('installed PWA opens its own saved page while network never responds', async () => {
  const handlers = new Map();
  const shell = { shell: true };
  let response;
  runInNewContext(source('apps/web/public/sw.js'), {
    URL,
    self: { location: { origin: 'https://cardo.example' }, addEventListener: (event, fn) => handlers.set(event, fn) },
    caches: { open: async () => ({ match: async () => shell }), match: async () => shell },
    fetch: () => new Promise(() => {}),
  });
  handlers.get('fetch')({
    request: { method: 'GET', url: 'https://cardo.example/cards', mode: 'navigate' },
    respondWith: (promise) => { response = promise; },
  });
  const result = await Promise.race([response, new Promise(resolve => setTimeout(() => resolve('hung'), 30))]);
  assert.equal(result, shell);
});

test('PWA without a saved current page obtains the page from the network', async () => {
  const handlers = new Map();
  const page = { fresh: true };
  let response;
  let calls = 0;
  runInNewContext(source('apps/web/public/sw.js'), {
    URL,
    self: { location: { origin: 'https://cardo.example' }, addEventListener: (event, fn) => handlers.set(event, fn) },
    caches: { open: async () => ({ match: async () => undefined }), match: async () => { throw new Error('must not read a different version'); } },
    fetch: async () => { calls++; return page; },
  });
  handlers.get('fetch')({
    request: { method: 'GET', url: 'https://cardo.example/cards', mode: 'navigate' },
    respondWith: (promise) => { response = promise; },
  });
  assert.equal(await response, page);
  assert.equal(calls, 1);
});

function apiWith(fetch) {
  const timers = new Map();
  const env = {
    fetch, performance, AbortController, Error,
    setTimeout: (fn, ms) => { timers.set(1, { fn, ms }); return 1; },
    clearTimeout: (id) => timers.delete(id),
  };
  runInNewContext(source('apps/web/src/api.js').replace('export const api =', 'globalThis.api ='), env);
  return { api: env.api, timers };
}

test('hung API request aborts and exposes a recoverable network error', async () => {
  let calls = 0;
  const { api, timers } = apiWith((_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const pending = api.profile();
  const verdict = assert.rejects(pending, error => error.network === true);
  assert.equal(timers.size, 1, 'API must bound network wait');
  assert.equal(timers.get(1).ms, 10000);
  timers.get(1).fn();
  await verdict;
  assert.equal(calls, 1);
  assert.equal(timers.size, 0);
});

test('deadline covers a response body that stalls after headers', async () => {
  const { api, timers } = apiWith(async (_url, options) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('body aborted')))),
  }));
  const pending = api.profile();
  const verdict = assert.rejects(pending, error => error.network === true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1);
  timers.get(1).fn();
  await verdict;
  assert.equal(timers.size, 0);
});

test('timed out transfer is never sent a second time automatically', async () => {
  let calls = 0;
  const { api, timers } = apiWith((_url, options) => {
    calls++;
    assert.equal(options.headers['Idempotency-Key'], 'same-operation-key');
    return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const pending = api.transfer({ amount: 100 }, 'same-operation-key');
  const verdict = assert.rejects(pending, error => error.network === true);
  assert.equal(timers.size, 1);
  timers.get(1).fn();
  await verdict;
  assert.equal(calls, 1);
});

test('successful API calls clear their deadline and preserve the response', async () => {
  const profile = { id: 'test-user' };
  const { api, timers } = apiWith(async () => ({ ok: true, json: async () => profile }));
  assert.equal(await api.profile(), profile);
  assert.equal(timers.size, 0);
});

test('anonymous profile preserves the UNAUTHORIZED 403 response for the login flow', async () => {
  const { api, timers } = apiWith(async () => ({
    ok: false, status: 403,
    json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Login required' } }),
  }));
  await assert.rejects(api.profile(), error => error.status === 403 && error.code === 'UNAUTHORIZED' && !error.network);
  assert.equal(timers.size, 0);
});

test('other 403 responses retain their distinct rejection code', async () => {
  const { api, timers } = apiWith(async () => ({
    ok: false, status: 403,
    json: async () => ({ error: { code: 'ORIGIN_REJECTED', message: 'Origin rejected' } }),
  }));
  await assert.rejects(api.profile(), error => error.status === 403 && error.code === 'ORIGIN_REJECTED' && !error.network);
  assert.equal(timers.size, 0);
});
