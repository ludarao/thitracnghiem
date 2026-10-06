import { prisma } from "./prisma";
import { advanceAttempt, type AttemptState } from "./attempt-state";
import { hydrateQuestions } from "./question-bank";
import type { ExamConfig, ExamResult, UserInfo } from "../types/quiz";

export async function getAttempt(token: string) {
  const a = await prisma.attempt.findUnique({ where: { token } });
  if (!a) throw new Error("Phiên thi không tồn tại.");
  const questions = await hydrateQuestions(a);
  const config = a.config as unknown as ExamConfig;
  const answers = a.answers as Record<string, string>;
  const result = (a.summary ?? a.result) as unknown as ExamResult | null;
  return {
    state: {
      id: a.id,
      info: a.info as unknown as UserInfo,
      config,
      questions,
      answers,
      currentIndex: 0,
      questionStartedAt: a.startTime.getTime(),
      startTime: a.startTime.getTime(),
      deadline: a.deadline.getTime(),
      result: result
        ? {
            ...result,
            answers: config.allowReview
              ? questions.map((q) => ({
                  questionId: q.id,
                  selectedOption: answers[String(q.id)] || "",
                  isCorrect: answers[String(q.id)] === q.correct,
                  timeSpentSeconds: 0,
                }))
              : [],
          }
        : null,
    },
    serverTime: Date.now(),
  };
}
export async function submitAttempt(token: string, answers: unknown) {
  const { state, serverTime } = await getAttempt(token);
  if (state.result) return { state, serverTime };
  if (
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers) ||
    Object.keys(answers).length > state.questions.length
  )
    throw new Error("Bài làm không hợp lệ.");
  const selected: Record<string, string> = {};
  const byId = new Map(state.questions.map((q) => [String(q.id), q]));
  for (const [id, option] of Object.entries(answers)) {
    const q = byId.get(id);
    if (
      !q ||
      typeof option !== "string" ||
      !["A", "B", "C", "D"].includes(option) ||
      !q.options[option as keyof typeof q.options]
    )
      throw new Error("Đáp án không hợp lệ.");
    selected[id] = option;
  }
  const graded = advanceAttempt(
    { ...state, answers: selected } as AttemptState,
    { action: "submit" },
    serverTime,
  );
  const result = graded.result!;
  // PostgreSQL rechecks submittedAt after acquiring the row lock. Exactly one
  // concurrent submit can win; subsequent requests cannot overwrite its answers.
  const saved = await prisma.attempt.updateMany({
    where: { id: state.id, submittedAt: null },
    data: {
      answers: selected,
      summary: JSON.parse(JSON.stringify({ ...result, answers: [] })),
      submittedAt: new Date(result.submittedAt),
    },
  });
  if (saved.count === 0) return getAttempt(token);
  return {
    state: {
      ...graded,
      result: {
        ...result,
        answers: state.config.allowReview ? result.answers : [],
      },
    },
    serverTime,
  };
}
