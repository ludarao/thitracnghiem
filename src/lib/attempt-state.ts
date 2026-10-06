import type { ExamConfig, ExamResult, Question, UserInfo } from "../types/quiz";

export interface AttemptState {
  id: string;
  info: UserInfo;
  config: ExamConfig;
  questions: Question[];
  answers: Record<string, string>;
  currentIndex: number;
  questionStartedAt: number;
  startTime: number;
  deadline: number;
  result: ExamResult | null;
}
export interface AttemptAction {
  action?: "answer" | "next" | "submit" | "sync";
  questionId?: number;
  option?: string;
}

/** Apply server time before accepting an answer, so expired questions cannot reopen. */
export function advanceAttempt(
  state: AttemptState,
  action: AttemptAction,
  now: number,
): AttemptState {
  if (state.result) return state;
  const next = { ...state, answers: { ...state.answers } };
  const per = state.config.timePerQuestionSeconds * 1000;
  let expired = false;
  if (per) {
    while (
      next.currentIndex < next.questions.length &&
      now >= next.questionStartedAt + per
    ) {
      next.currentIndex++;
      next.questionStartedAt += per;
      expired = true;
    }
  }
  if (now < next.deadline && next.currentIndex < next.questions.length) {
    if (action.action === "answer") {
      if (!action.option || !["A", "B", "C", "D"].includes(action.option))
        throw new Error("Đáp án không hợp lệ.");
      const q = next.questions.find((q) => q.id === action.questionId);
      if (!q || !q.options[action.option as keyof Question["options"]])
        throw new Error("Câu hỏi hoặc lựa chọn không hợp lệ.");
      if (!per || (!expired && q.id === next.questions[next.currentIndex].id))
        next.answers[String(q.id)] = action.option;
    } else if (
      action.action === "next" &&
      per &&
      !expired &&
      action.questionId === next.questions[next.currentIndex].id
    ) {
      next.currentIndex++;
      next.questionStartedAt = now;
    } else if (
      action.action &&
      !["submit", "sync", "next"].includes(action.action)
    ) {
      throw new Error("Thao tác không hợp lệ.");
    }
  }
  if (
    action.action === "submit" ||
    now >= next.deadline ||
    next.currentIndex >= next.questions.length
  ) {
    const end = Math.min(
      now,
      next.deadline,
      per && next.currentIndex >= next.questions.length
        ? next.questionStartedAt
        : Infinity,
    );
    const logs = next.questions.map((q) => ({
      questionId: q.id,
      selectedOption: next.answers[String(q.id)] || "",
      isCorrect: next.answers[String(q.id)] === q.correct,
      timeSpentSeconds: 0,
    }));
    const correct = logs.filter((l) => l.isCorrect).length;
    const ratio = correct / next.questions.length;
    next.result = {
      id: next.id,
      userInfo: next.info,
      startTime: new Date(next.startTime).toISOString(),
      endTime: new Date(end).toISOString(),
      totalDurationSeconds: Math.max(
        0,
        Math.round((end - next.startTime) / 1000),
      ),
      score: Math.round(ratio * 100) / 10,
      correctCount: correct,
      totalQuestions: next.questions.length,
      percentage: Math.round(ratio * 100),
      isPassed: ratio * 100 >= next.config.passingScorePercent,
      answers: logs,
      submittedAt: new Date(end).toISOString(),
    };
  }
  return next;
}

/** Deduplicate first, then filter by unit: a previous unit must not retain an old score. */
export function latestAttempts<
  T extends { candidateId: string; submittedAt: Date | null; id: string },
>(attempts: T[]): T[] {
  const seen = new Set<string>();
  return [...attempts]
    .filter((a) => a.submittedAt)
    .sort(
      (a, b) =>
        b.submittedAt!.getTime() - a.submittedAt!.getTime() ||
        b.id.localeCompare(a.id),
    )
    .filter((a) => {
      if (seen.has(a.candidateId)) return false;
      seen.add(a.candidateId);
      return true;
    });
}
