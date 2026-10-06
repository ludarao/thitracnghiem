import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  candidateCode,
  validateQuestions,
  prepareQuestions,
  validateConfig,
} from "../src/lib/quiz-rules.ts";
import { advanceAttempt, latestAttempts } from "../src/lib/attempt-state.ts";
import {
  DEFAULT_CONFIG,
  calculateCollectiveRanks,
} from "../src/lib/storage.ts";
const questions = [
  {
    id: 1,
    question: "Một",
    options: { A: "Giống", B: "Giống", C: "C", D: "D" },
    correct: "A",
  },
  {
    id: 2,
    question: "Hai",
    options: { A: "A", B: "B", C: "C", D: "D" },
    correct: "B",
  },
];
const cfg = { ...DEFAULT_CONFIG, questionCount: 2, timePerQuestionSeconds: 10 };
function state(config = cfg) {
  return {
    id: "attempt",
    info: {
      fullName: "Nguyễn Văn An",
      unit: "Đơn vị",
      rank: "Đoàn viên",
      position: "Cán bộ",
    },
    config,
    questions,
    answers: {},
    currentIndex: 0,
    questionStartedAt: 1000,
    startTime: 1000,
    deadline: 61000,
    result: null,
  };
}
test("Chuẩn hóa điện thoại và mã họ tên có dấu", () => {
  assert.equal(normalizePhone("+84 912 345 678"), "0912345678");
  assert.equal(
    candidateCode("  Đặng  Thị Ánh ", "0912345678"),
    "DTA0912345678",
  );
  assert.throws(() => normalizePhone("123"));
  assert.throws(() => normalizePhone("0912345678abc"));
});
test("Từ chối câu trùng ID và đáp án sai", () => {
  assert.throws(() => validateQuestions([questions[0], questions[0]]));
  assert.throws(() => validateQuestions([{ ...questions[0], correct: "E" }]));
  assert.throws(() =>
    validateQuestions([
      { ...questions[0], options: { A: "", B: "B", C: "", D: "" } },
    ]),
  );
  assert.equal(validateQuestions(questions).length, 2);
});
test("Cấu hình phải có đơn vị, thời gian và số câu hợp lệ", () => {
  assert.throws(() => validateConfig({ ...cfg, questionCount: 3 }, 2));
  assert.throws(() => validateConfig({ ...cfg, totalTimeMinutes: 0 }, 2));
  assert.throws(() => validateConfig({ ...cfg, units: [] }, 2));
});
test("Đảo đáp án giữ chính xác khóa gốc ngay cả khi hai lựa chọn cùng nội dung", () => {
  for (let i = 0; i < 100; i++) {
    const prepared = prepareQuestions(questions, {
      ...cfg,
      shuffleQuestions: false,
    });
    assert.equal(prepared[0].options[prepared[0].correct], "Giống");
    assert.equal(prepared[1].options[prepared[1].correct], "B");
    assert.deepEqual(
      Object.values(prepared[0].options).sort(),
      Object.values(questions[0].options).sort(),
    );
  }
});
test("Hết giờ khóa câu, từ chối đáp án muộn và không reset hạn giờ khi đồng bộ", () => {
  const answered = advanceAttempt(
    state(),
    { action: "answer", questionId: 1, option: "A" },
    9000,
  );
  const expired = advanceAttempt(
    answered,
    { action: "answer", questionId: 1, option: "C" },
    11000,
  );
  assert.equal(expired.currentIndex, 1);
  assert.equal(expired.answers[1], "A");
  assert.equal(expired.questionStartedAt, 11000);
  const reload = advanceAttempt(expired, { action: "sync" }, 13000);
  assert.equal(reload.questionStartedAt, 11000);
  const tamper = advanceAttempt(
    reload,
    { action: "answer", questionId: 1, option: "D" },
    14000,
  );
  assert.equal(tamper.answers[1], "A");
});
test("Không được trả lời câu tương lai, chuyển câu thủ công không được quay lại", () => {
  let a = advanceAttempt(
    state(),
    { action: "answer", questionId: 2, option: "B" },
    2000,
  );
  assert.deepEqual(a.answers, {});
  a = advanceAttempt(a, { action: "next", questionId: 1 }, 3000);
  assert.equal(a.currentIndex, 1);
  a = advanceAttempt(a, { action: "next", questionId: 1 }, 4000);
  assert.equal(a.currentIndex, 1);
});
test("Hết giờ câu cuối tự nộp, bỏ qua thao tác trễ", () => {
  const a = advanceAttempt(
    state(),
    { action: "answer", questionId: 2, option: "B" },
    22000,
  );
  assert.equal(a.result.correctCount, 0);
  assert.equal(a.result.totalDurationSeconds, 20);
  assert.equal(a.result.endTime, new Date(21000).toISOString());
});
test("Hạn tổng khóa đáp án và nộp bài theo thời gian server", () => {
  const a = advanceAttempt(
    { ...state({ ...cfg, timePerQuestionSeconds: 0 }), deadline: 6000 },
    { action: "answer", questionId: 1, option: "A" },
    7000,
  );
  assert.equal(a.result.correctCount, 0);
  assert.equal(a.result.totalDurationSeconds, 5);
});
test("Chấm ở server, nộp lại giữ nguyên kết quả và không nhận điểm giả", () => {
  let a = advanceAttempt(
    state({ ...cfg, timePerQuestionSeconds: 0 }),
    { action: "answer", questionId: 1, option: "A" },
    2000,
  );
  a = advanceAttempt(a, { action: "answer", questionId: 2, option: "B" }, 3000);
  a = advanceAttempt(a, { action: "submit", score: 0 }, 4000);
  assert.equal(a.result.score, 10);
  const duplicate = advanceAttempt(
    a,
    { action: "answer", questionId: 1, option: "D" },
    5000,
  );
  assert.strictEqual(duplicate, a);
});
test("Ngưỡng đạt sử dụng tỷ lệ thật, không tỷ lệ làm tròn", () => {
  const a = state({
    ...cfg,
    timePerQuestionSeconds: 0,
    passingScorePercent: 67,
  });
  a.questions = [...questions, { ...questions[1], id: 3 }];
  a.answers = { 1: "A", 2: "B" };
  const submitted = advanceAttempt(a, { action: "submit" }, 5000);
  assert.equal(submitted.result.percentage, 67);
  assert.equal(submitted.result.isPassed, false);
});
test("Lấy lượt đã nộp cuối, kể cả điểm thấp hơn; lượt chưa nộp không thay thế", () => {
  const attempts = [
    { id: "1", candidateId: "a", submittedAt: new Date(1000), score: 10 },
    { id: "2", candidateId: "a", submittedAt: new Date(2000), score: 3 },
    { id: "3", candidateId: "a", submittedAt: null, score: 9 },
    { id: "4", candidateId: "b", submittedAt: new Date(1500), score: 5 },
  ];
  const latest = latestAttempts(attempts);
  assert.equal(latest.length, 2);
  assert.equal(latest[0].score, 3);
});
test("Tập thể dùng trạng thái đạt của kỳ thi và số người đã khử trùng", () => {
  const result = {
    userInfo: { unit: "Đơn vị" },
    score: 7,
    percentage: 70,
    isPassed: true,
  };
  const ranks = calculateCollectiveRanks(
    [result],
    [{ name: "Đơn vị", targetCount: 2 }],
  );
  assert.equal(ranks[0].participationRate, 50);
  assert.equal(ranks[0].passRate, 100);
  assert.equal(ranks[0].overallScore, 72);
});
