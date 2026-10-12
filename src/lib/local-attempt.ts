import type { ExamConfig, UserInfo, Question, ExamResult } from "../types/quiz";
import { emptyGuard, type GuardState } from "./local-exam-guard";
export const LOCAL_ATTEMPT_KEY = "quiz_local_attempt_v2";
const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export type LocalSession = {
  config: ExamConfig;
  userInfo: UserInfo;
  questions: Question[];
  answers: Record<number, string>;
  currentIndex: number;
  serverTime: number;
  deadline: string;
  result: ExamResult | null;
};
export type SavedAttempt = {
  token: string;
  session: LocalSession;
  offset: number;
  frozen: Record<number, string> | null;
  guard: GuardState;
};
export function parseLocalAttempt(raw: string): SavedAttempt {
  const saved = JSON.parse(raw);
  if (
    !record(saved) ||
    !(
      saved.version === undefined ||
      saved.version === 2 ||
      saved.version === 3
    ) ||
    typeof saved.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(saved.token) ||
    !Number.isFinite(saved.offset) ||
    !record(saved.session)
  )
    throw new Error("Bản lưu bài thi không hợp lệ.");
  const s = saved.session;
  if (
    !record(s.config) ||
    typeof s.config.title !== "string" ||
    !Array.isArray(s.config.units) ||
    typeof s.config.allowReview !== "boolean" ||
    !record(s.userInfo) ||
    typeof s.userInfo.unit !== "string" ||
    !Number.isFinite(Date.parse(s.deadline)) ||
    !Array.isArray(s.questions) ||
    !s.questions.length ||
    s.questions.length > 10000
  )
    throw new Error("Bản lưu thiếu đề hoặc cấu hình hợp lệ.");
  for (const key of ["monitorEnabled", "preventCopy"]) {
    if (s.config[key] !== undefined && typeof s.config[key] !== "boolean")
      throw new Error("Cấu hình giám sát trong bản lưu không hợp lệ.");
  }
  if (
    s.config.maxAwaySeconds !== undefined &&
    (!Number.isInteger(s.config.maxAwaySeconds) ||
      s.config.maxAwaySeconds < 5 ||
      s.config.maxAwaySeconds > 300)
  )
    throw new Error("Thời gian rời màn hình trong bản lưu không hợp lệ.");
  const ids = new Set<number>();
  for (const q of s.questions) {
    if (
      !record(q) ||
      !Number.isInteger(q.id) ||
      q.id < 1 ||
      ids.has(q.id) ||
      typeof q.question !== "string" ||
      !record(q.options) ||
      !["A", "B", "C", "D"].every((key) => typeof q.options[key] === "string")
    )
      throw new Error("Đề trong bản lưu không hợp lệ.");
    ids.add(q.id);
  }
  const answers = (value: unknown) =>
    record(value) &&
    Object.entries(value).every(
      ([key, option]) =>
        ids.has(Number(key)) &&
        String(Number(key)) === key &&
        typeof option === "string" &&
        ["A", "B", "C", "D"].includes(option),
    );
  if (
    !answers(s.answers) ||
    !(saved.frozen == null || answers(saved.frozen)) ||
    !(
      s.currentIndex === undefined ||
      (Number.isInteger(s.currentIndex) &&
        s.currentIndex >= 0 &&
        s.currentIndex < s.questions.length)
    )
  )
    throw new Error("Đáp án hoặc tiến độ trong bản lưu không hợp lệ.");
  if (
    s.result !== null &&
    (!record(s.result) ||
      !Number.isFinite(s.result.score) ||
      !record(s.result.userInfo) ||
      typeof s.result.isPassed !== "boolean")
  )
    throw new Error("Kết quả trong bản lưu không hợp lệ.");
  const g = saved.guard ?? emptyGuard();
  if (
    !record(g) ||
    ![g.awaySince, g.returnedAt].every(
      (v) => v === null || Number.isFinite(v),
    ) ||
    !Number.isInteger(g.leaveCount) ||
    g.leaveCount < 0 ||
    !Number.isFinite(g.totalAwayMs) ||
    g.totalAwayMs < 0 ||
    !(g.awayAnswers === null || answers(g.awayAnswers)) ||
    ![null, "away", "deadline"].includes(g.endedReason) ||
    typeof g.acknowledged !== "boolean" ||
    (g.awaySince !== null && g.awayAnswers === null) ||
    (g.returnedAt !== null && g.awaySince === null)
  )
    throw new Error("Trạng thái giám sát trong bản lưu không hợp lệ.");
  return {
    token: saved.token,
    session: { ...s, currentIndex: s.currentIndex ?? 0 } as LocalSession,
    offset: saved.offset,
    frozen: saved.frozen ?? null,
    guard: g as GuardState,
  };
}
export function quarantineAttempt(
  storage: Pick<Storage, "setItem" | "removeItem">,
  raw: string,
  now: number,
) {
  const key = "quiz_corrupt_attempt_" + now;
  storage.setItem(key, raw); // Never remove the original unless a backup was saved.
  storage.removeItem(LOCAL_ATTEMPT_KEY);
  return key;
}
