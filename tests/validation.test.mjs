import test from "node:test";
import assert from "node:assert/strict";
import {
  phone,
  minor,
  decimal,
  password,
} from "../packages/shared/validation.ts";
test("phone formats normalize to one identity", () => {
  for (const value of ["+7 (999) 123-45-67", "89991234567", "9991234567"])
    assert.equal(phone(value), "+79991234567");
  for (const value of ["+1 999 1234567", "+799912345670", "79991234abc"])
    assert.throws(() => phone(value));
});
test("money stays exact in minor units", () => {
  assert.equal(minor("0.01"), 1n);
  assert.equal(minor("10.10") + minor("0.20"), 1030n);
  assert.equal(decimal(1030n), "10.30");
  for (const value of ["0", "-1", "1.001", "Infinity", "1e4"])
    assert.throws(() => minor(value));
});
test("password requires a letter and digit without spaces", () => {
  assert.equal(password("Cardo123"), "Cardo123");
  for (const value of ["12345678", "abcdefgh", "ab12", "Cardo 123"])
    assert.throws(() => password(value));
});
