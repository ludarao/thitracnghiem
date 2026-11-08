import test from "node:test";
import assert from "node:assert/strict";
import {
  editableQuestionSets,
  replaceQuestionSet,
  validateQuestionSetPlan,
} from "../src/lib/question-sets.ts";
import {
  prepareQuestions,
  validateConfig,
  validateQuestions,
} from "../src/lib/quiz-rules.ts";
import { DEFAULT_CONFIG } from "../src/lib/storage.ts";
const question = (id, setId) => ({
  id,
  setId,
  question: `Q${id}`,
  options: { A: "a", B: "b", C: "c", D: "d" },
  correct: "C",
});
const sets = [
  { id: "one", name: "Bộ 1", questionCount: 3 },
  { id: "two", name: "Bộ 2", questionCount: 2 },
  { id: "three", name: "Bộ 3", questionCount: 1 },
  { id: "four", name: "Bộ 4", questionCount: 0 },
];
const bank = sets.flatMap((set, index) =>
  Array.from({ length: 8 }, (_, i) => question(index * 8 + i + 1, set.id)),
);
const config = { ...DEFAULT_CONFIG, questionCount: 6, questionSets: sets };

test("every generated exam has exact per-set quotas, distinct questions and correctly shuffled answers", () => {
  const signatures = new Set();
  for (let i = 0; i < 100; i++) {
    const picked = prepareQuestions(bank, config);
    assert.equal(picked.length, 6);
    assert.equal(new Set(picked.map((q) => q.id)).size, 6);
    for (const set of sets)
      assert.equal(
        picked.filter((q) => q.setId === set.id).length,
        set.questionCount,
      );
    assert.ok(picked.every((q) => q.options[q.correct] === "c"));
    signatures.add(picked.map((q) => q.id).join(","));
  }
  assert.ok(signatures.size > 1);
  assert.deepEqual(
    prepareQuestions(bank, {
      ...config,
      shuffleQuestions: false,
      shuffleOptions: false,
    }).map((q) => q.id),
    [1, 2, 3, 9, 10, 17],
  );
});

test("allocations reject shortage, inconsistent totals, missing sets and malformed quotas", () => {
  assert.equal(
    validateConfig(config, bank.length, bank).questionSets.length,
    4,
  );
  for (const badSets of [
    [],
    null,
    [null],
    [...sets, sets[0]],
    sets.map((s) => ({ ...s, name: "same" })),
    sets.map((s, i) => (i ? s : { ...s, questionCount: -1 })),
    sets.map((s, i) => (i ? s : { ...s, questionCount: 0.5 })),
    sets.map((s, i) => (i ? s : { ...s, questionCount: "3" })),
    sets.map((s, i) => (i ? s : { ...s, questionCount: 9 })),
  ])
    assert.throws(() =>
      validateConfig({ ...config, questionSets: badSets }, bank.length, bank),
    );
  assert.throws(
    () => validateQuestionSetPlan({ ...config, questionCount: 7 }, bank),
    /Tổng số câu/,
  );
  assert.throws(
    () =>
      validateQuestionSetPlan(
        config,
        bank.map((q, i) => (i ? q : { ...q, setId: "unknown" })),
      ),
    /bộ hợp lệ/,
  );
  assert.throws(
    () =>
      prepareQuestions(
        bank.filter((q) => q.setId !== "two"),
        config,
      ),
    /Bộ 2 chỉ có 0/,
  );
});

test("legacy banks keep their questions, IDs and old selection behavior until saved as one set", () => {
  const old = bank.slice(0, 8).map(({ setId, ...q }) => q);
  const oldConfig = {
    ...DEFAULT_CONFIG,
    questionCount: 4,
    shuffleQuestions: false,
    shuffleOptions: false,
  };
  const converted = editableQuestionSets(oldConfig, old);
  assert.ok(!oldConfig.questionSets && !old[0].setId);
  assert.deepEqual(converted.config.questionSets, [
    { id: "legacy", name: "Bộ 1", questionCount: 4 },
  ]);
  assert.deepEqual(
    converted.questions.map((q) => q.id),
    old.map((q) => q.id),
  );
  assert.deepEqual(
    prepareQuestions(old, oldConfig).map((q) => q.id),
    [1, 2, 3, 4],
  );
  assert.equal(
    validateConfig(converted.config, old.length, converted.questions)
      .questionSets[0].questionCount,
    4,
  );
});

test("uploading files with repeated TT replaces only the selected set and never collides with other IDs", () => {
  const original = structuredClone(bank);
  const incoming = [question(1), question(2), question(3)];
  const replaced = replaceQuestionSet(bank, "two", incoming);
  assert.deepEqual(
    replaced.filter((q) => q.setId !== "two"),
    bank.filter((q) => q.setId !== "two"),
  );
  assert.equal(replaced.filter((q) => q.setId === "two").length, 3);
  assert.equal(new Set(replaced.map((q) => q.id)).size, replaced.length);
  validateQuestions(replaced);
  validateQuestionSetPlan(config, replaced);
  assert.deepEqual(bank, original);
  assert.throws(
    () =>
      validateQuestionSetPlan(
        config,
        replaceQuestionSet(bank, "two", incoming.slice(0, 1)),
      ),
    /Bộ 2 chỉ có 1/,
  );
});
