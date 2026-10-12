import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    swc.transformSync(readFileSync(filename, "utf8"), {
      filename,
      jsc: { parser: { syntax: "typescript" }, target: "es2022" },
      module: { type: "commonjs" },
    }).code,
    filename,
  );
const {
  emptyGuard,
  leaveExam,
  returnToExam,
  checkAway,
  continueExam,
  validateMonitoringReport,
} = require("../src/lib/local-exam-guard.ts");
const {
  parseLocalAttempt,
  quarantineAttempt,
  LOCAL_ATTEMPT_KEY,
} = require("../src/lib/local-attempt.ts");
const { claimExamTab } = require("../src/lib/tab-ownership.ts");
const fixture = {
  token: "a".repeat(64),
  offset: 0,
  frozen: null,
  session: {
    config: { title: "Test", units: [], allowReview: false },
    userInfo: { unit: "A" },
    questions: [
      { id: 1, question: "Q", options: { A: "A", B: "B", C: "", D: "" } },
    ],
    answers: { 1: "A" },
    currentIndex: 0,
    deadline: new Date(1000000).toISOString(),
    result: null,
  },
};
test("duplicate blur/hidden keeps first timestamp and departure answers", () => {
  const g = leaveExam(emptyGuard(), 1000, { 1: "A" });
  assert.equal(leaveExam(g, 5000, { 1: "B" }), g);
  assert.deepEqual(g.awayAnswers, { 1: "A" });
  assert.equal(g.leaveCount, 1);
});
test("return before limit can acknowledge without counting popup reading time", () => {
  const g = returnToExam(
    leaveExam(emptyGuard(), 1000, {}),
    11000,
    30000,
    1000000,
  );
  assert.equal(checkAway(g, 61000, 30000, 1000000).endedReason, null);
  const continued = continueExam(g);
  assert.equal(continued.awaySince, null);
  assert.equal(continued.totalAwayMs, 10000);
  const next = leaveExam(g, 12000, {});
  assert.equal(next.returnedAt, null);
  assert.equal(next.leaveCount, 2);
  assert.equal(checkAway(next, 42000, 30000, 1000000).endedReason, "away");
});
test("exact limit locks, reload/suspended timer cannot extend it; earlier exam deadline wins", () => {
  const g = leaveExam(emptyGuard(), 1000, { 1: "A" });
  assert.equal(checkAway(g, 30999, 30000, 1000000).endedReason, null);
  const ended = returnToExam(g, 31000, 30000, 1000000);
  assert.equal(ended.endedReason, "away");
  assert.equal(continueExam(ended), ended);
  assert.equal(checkAway(g, 60000, 30000, 20000).endedReason, "deadline");
  assert.equal(checkAway(g, 60000, 30000, 50000).endedReason, "away");
});
test("legacy v2 snapshot migrates locally; broken snapshots reject; quarantine never deletes without backup", () => {
  assert.equal(
    parseLocalAttempt(JSON.stringify(fixture)).guard.awaySince,
    null,
  );
  for (const bad of [
    "{",
    JSON.stringify({ ...fixture, token: "fake" }),
    JSON.stringify({
      ...fixture,
      session: { ...fixture.session, questions: [] },
    }),
    JSON.stringify({ ...fixture, version: 999 }),
    JSON.stringify({ ...fixture, frozen: { 999: "A" } }),
  ])
    assert.throws(() => parseLocalAttempt(bad));
  const data = new Map([[LOCAL_ATTEMPT_KEY, "bad"]]);
  assert.throws(() =>
    quarantineAttempt(
      {
        setItem() {
          throw new Error("quota");
        },
        removeItem: (k) => data.delete(k),
      },
      "bad",
      1,
    ),
  );
  assert.equal(data.get(LOCAL_ATTEMPT_KEY), "bad");
  quarantineAttempt(
    { setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) },
    "bad",
    2,
  );
  assert.equal(data.has(LOCAL_ATTEMPT_KEY), false);
  assert.equal(data.get("quiz_corrupt_attempt_2"), "bad");
});
test("one local owner blocks second tab; closing owner permits retry; unsupported fails closed", async () => {
  let held = false;
  const locks = {
    async request(name, options, callback) {
      if (held) return callback(null);
      held = true;
      try {
        await callback({ name });
      } finally {
        held = false;
      }
    },
  };
  let a, b;
  const release = claimExamTab(locks, (state) => (a = state));
  const blocked = claimExamTab(locks, (state) => (b = state));
  assert.equal(a, "owned");
  assert.equal(b, "blocked");
  blocked();
  release();
  await new Promise((r) => setImmediate(r));
  const releaseNext = claimExamTab(locks, (state) => (b = state));
  assert.equal(b, "owned");
  releaseNext();
  claimExamTab(undefined, (state) => (a = state));
  assert.equal(a, "unsupported");
});
test("monitoring report is bounded and explicitly labelled client-reported", () => {
  assert.equal(validateMonitoringReport(undefined), undefined);
  assert.deepEqual(
    validateMonitoringReport({
      leaveCount: 1,
      totalAwayMs: 30000,
      terminationReason: "away",
      reportedByClient: false,
    }),
    {
      reportedByClient: true,
      leaveCount: 1,
      totalAwayMs: 30000,
      terminationReason: "away",
    },
  );
  assert.throws(() =>
    validateMonitoringReport({
      leaveCount: -1,
      totalAwayMs: 0,
      terminationReason: null,
    }),
  );
});
