import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { offerTemplates, offerForSequence } from "../services/engagement/src/content/offers.ts";

test("offer catalogue contains a month of distinct readable notifications", () => {
  assert.ok(offerTemplates.length >= 180);
  for (const key of ["id", "title", "body"]) {
    assert.equal(new Set(offerTemplates.map(offer => offer[key])).size, offerTemplates.length);
    assert.ok(offerTemplates.every(offer => offer[key].trim() === offer[key]));
  }
  for (const offer of offerTemplates) {
    assert.match(offer.id, /^[a-z]+-\d{2}$/);
    assert.ok(offer.title.length > 0 && offer.title.length <= 48, offer.id + " title length");
    assert.ok(offer.body.length > 0 && offer.body.length <= 180, offer.id + " body length");
    assert.ok(["/", "/history", "/cards", "/rewards", "/notifications", "/exchange", "/send", "/settings", "/profile"].includes(offer.url));
    assert.doesNotMatch(offer.title + " " + offer.body, /тест|\bQA\b|баг|чек-лист|регресс|DevTools|Network|SQL|Charles|Docker|HTTP|API/iu);
  }
});

test("each account receives the full catalogue before a repeat, including across cycles", () => {
  const count = offerTemplates.length;
  const user = randomUUID();
  let previous;
  const seenAt = new Map();
  let firstCycle;
  for (let cycle = 0; cycle < 8; cycle++) {
    const ids = [];
    for (let index = 0; index < count; index++) {
      const offer = offerForSequence(user, BigInt(cycle * count + index));
      assert.notEqual(offer.id, previous);
      const position = cycle * count + index;
      if (seenAt.has(offer.id)) assert.ok(position - seenAt.get(offer.id) >= count);
      seenAt.set(offer.id, position);
      ids.push(offer.id);
      previous = offer.id;
    }
    assert.equal(new Set(ids).size, count);
    assert.deepEqual([...ids].sort(), offerTemplates.map(offer => offer.id).sort());
    if (!firstCycle) firstCycle = ids;
    else assert.deepEqual(ids, firstCycle);
  }
});

test("offer order belongs to the account and persists without process state", () => {
  const count = offerTemplates.length;
  const firstUser = randomUUID(), secondUser = randomUUID();
  const positions = [0n, 1n, BigInt(count - 1), BigInt(count), 9007199254740993n];
  const first = positions.map(position => offerForSequence(firstUser, position).id);
  assert.deepEqual(positions.map(position => offerForSequence(firstUser, position.toString()).id), first);
  assert.notDeepEqual(positions.map(position => offerForSequence(secondUser, position).id), first);
  assert.throws(() => offerForSequence(firstUser, -1n), RangeError);
});
