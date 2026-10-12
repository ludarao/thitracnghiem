import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateIdentity,
  formatNameInitials,
} from "../src/lib/candidate-identity.ts";
test("identity uses lowercase initials and preserves phone leading zero", () => {
  const expected = {
    nameInitials: "ptb",
    phone: "0985728123",
    candidateCode: "ptb0985728123",
  };
  assert.deepEqual(candidateIdentity("PTB", "0985728123"), expected);
  assert.deepEqual(candidateIdentity(" P T B ", "+84 985 728 123"), expected);
  assert.equal(
    candidateIdentity("ĐVB", "0912345678").candidateCode,
    "dvb0912345678",
  );
  assert.equal(formatNameInitials(""), "");
});
test("invalid initials and phones reject instead of changing candidate identity silently", () => {
  for (const initials of ["", "123", "<script>", "pt-b", "a".repeat(21), null])
    assert.throws(() => candidateIdentity(initials, "0985728123"));
  for (const phone of [
    "",
    "985728123",
    "098572812",
    "0123456789",
    "09857281234",
    null,
    985728123,
  ])
    assert.throws(() => candidateIdentity("ptb", phone));
});
