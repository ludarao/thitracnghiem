import test from "node:test";
import assert from "node:assert/strict";
import { publicCandidateCode } from "../src/lib/public-candidate-code.ts";
test("public code hides exactly four final phone digits including legacy records", () => {
  assert.equal(
    publicCandidateCode({
      unit: "A",
      candidateCode: "ptb0985728123",
      phone: "0985728123",
    }),
    "ptb098572****",
  );
  assert.equal(
    publicCandidateCode({ unit: "A", candidateCode: "PTB0985728123" }),
    "ptb098572****",
  );
  assert.equal(
    publicCandidateCode({
      unit: "A",
      nameInitials: "ptb",
      phone: "0985728123",
    }),
    "ptb098572****",
  );
  assert.equal(
    publicCandidateCode({ unit: "A", serviceNumber: "649-605" }),
    "649****",
  );
  assert.equal(
    publicCandidateCode({ unit: "A", fullName: "Private name" }),
    "Thí sinh cũ",
  );
  assert.ok(
    !publicCandidateCode({
      unit: "A",
      candidateCode: "ptb0985728123extra",
      phone: "0985728123",
    }).includes("0985728123"),
  );
});
