import test from "node:test";
import assert from "node:assert/strict";
import { formatServiceNumberInput } from "../src/lib/service-number-input.ts";
test("partial input, paste and leading zeroes use XXX-XXX format", () => {
  for (const [input, expected] of [
    ["", ""],
    ["6", "6"],
    ["65", "65"],
    ["650", "650"],
    ["6506", "650-6"],
    ["65069", "650-69"],
    ["650695", "650-695"],
    ["650-695", "650-695"],
    [" 001002 ", "001-002"],
  ])
    assert.equal(formatServiceNumberInput(input), expected);
});
test("overlong or non-numeric input is rejected rather than silently changing identity", () => {
  for (const input of ["6506957", "abc650695", "<650695>"])
    assert.throws(() => formatServiceNumberInput(input));
});
