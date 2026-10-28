import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { watchConsumer, offsetRange, producerRecovery } from '../packages/shared/kafka-lifecycle.ts';
import { acceptEvent, indexEvents } from '../services/telemetry/src/event-store.ts';

test('terminal Kafka crash is unhealthy and requests process recovery, graceful stop does not', () => {
  const emitter = new EventEmitter();
  emitter.events = Object.fromEntries(['GROUP_JOIN','HEARTBEAT','CRASH','STOP','DISCONNECT','REBALANCING'].map(k => [k,k]));
  let fatal = 0;
  const watcher = watchConsumer(emitter, 'telemetry', 'test-group', () => fatal++);
  emitter.emit('GROUP_JOIN', { payload: {} });
  assert.equal(watcher.ready(), true);
  emitter.emit('CRASH', { payload: { restart: false, error: new Error('private connection details') } });
  assert.equal(watcher.ready(), false);
  assert.equal(fatal, 1);
  watcher.close();
  emitter.emit('STOP', { payload: {} });
  assert.equal(fatal, 1);
});

test('idle healthy consumers stay ready; stalled restarts expire after a bounded deadline', () => {
  const emitter = new EventEmitter();
  emitter.events = Object.fromEntries(['GROUP_JOIN','HEARTBEAT','CRASH','STOP','DISCONNECT','REBALANCING'].map(k => [k,k]));
  let now = 0, fatal = 0;
  const watcher = watchConsumer(emitter, 'telemetry', 'idle-group', () => fatal++, () => now);
  emitter.emit('GROUP_JOIN', { payload: {} });
  now = 40000;
  emitter.emit('HEARTBEAT', { payload: {} });
  now = 80000;
  watcher.check();
  assert.equal(watcher.ready(), true);
  emitter.emit('CRASH', { payload: { restart: true } });
  now += 60001;
  watcher.check();
  assert.equal(fatal, 1);
  watcher.close();
});

test('expired Kafka offsets are a retention gap, not available messages', () => {
  assert.deepEqual(offsetRange('12', '30', '4'), { lag: 18, gap: 8, uncommitted: false });
  assert.deepEqual(offsetRange('12', '30', '-1'), { lag: 18, gap: 0, uncommitted: true });
});

test('fenced producers and exhausted consecutive failures request recovery', () => {
  let fatal=0;
  const recovery=producerRecovery('banking',()=>fatal++);
  recovery.failure({type:'PRODUCER_FENCED'});
  assert.equal(fatal,1);
  recovery.success();
  for(let i=0;i<5;i++)recovery.failure(new Error());
  assert.equal(fatal,1);
  recovery.failure(new Error());
  assert.equal(fatal,2);
});

test('dashboard identities stay unique and operational history uses the restricted source', async () => {
  const d=JSON.parse(await readFile(new URL('../infra/grafana/dashboards/cardo.json',import.meta.url),'utf8'));
  assert.equal(new Set(d.panels.map(p=>p.id)).size,d.panels.length);
  for(const id of [11,12,13,14,15,16])assert.equal(d.panels.find(p=>p.id===id).datasource.uid,'cardo-operations');
});

const input = { topic: 'cardo.transfers.v1', partition: 0, offset: '12', value: JSON.stringify({ eventId: 'test-event', occurredAt: '2026-10-26T12:00:00Z', type: 'banking.transfer.completed', operationId: 'tr-test', amount: '10.00', currency: 'RUB', email: 'private@example.test' }) };
test('Kafka handler waits for durable SQL acknowledgement and propagates a failed commit', async () => {
  let finish;
  const pending = new Promise(resolve => finish = resolve);
  let sql, values, done = false;
  const pool = { query: async (q,v) => { sql=q; values=v; await pending; return { rows: [] }; } };
  const processing = acceptEvent(pool, input).then(() => done = true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false);
  assert.match(sql, /INSERT INTO telemetry.events/);
  assert.ok(!JSON.stringify(values).includes('private@example.test'));
  finish();
  await processing;
  await assert.rejects(acceptEvent({ query: async () => { throw new Error('database offline'); } }, input), /database offline/);
});

test('malformed payload is durably quarantined without copying the raw personal payload', async () => {
  let values;
  await acceptEvent({ query: async (_q,v) => { values=v; return { rows: [] }; } }, { ...input, value: '{private invalid data' });
  assert.ok(values.includes('quarantine'));
  assert.ok(!JSON.stringify(values).includes('private invalid data'));
});

test('bulk item failures are retried; repeated delivery uses the same concrete index and document id', async () => {
  const calls = [];
  const row = { id: 'stable-id', payload: { '@timestamp': '2026-10-26T12:00:00.000Z' }, occurred_at: new Date('2026-10-26T12:00:00Z'), attempts: 1 };
  const pool = { query: async (q,v) => { calls.push([q,v]); return q.startsWith('SELECT') ? { rows: [row] } : { rows: [] }; } };
  const bodies = [];
  const send = async (_url, options) => { bodies.push(options.body); return { ok: true, json: async () => ({ items: [{ create: { status: bodies.length === 1 ? 503 : 409 } }] }) }; };
  await indexEvents(pool, 'http://elastic.test', 'test-credential', send);
  assert.ok(calls.some(([q]) => q.includes('last_code') && q.includes('next_attempt_at')));
  await indexEvents(pool, 'http://elastic.test', 'test-credential', send);
  assert.equal(bodies[0], bodies[1]);
  assert.ok(bodies[0].includes('cardo-events-2026.10.26'));
  assert.ok(calls.some(([q]) => q.includes("state='indexed'")));
});
