import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { advanceAttempt, type AttemptState } from "./attempt-state";
import { hydrateQuestions } from "./question-bank";
import type { ExamConfig, ExamResult, UserInfo } from "../types/quiz";

export async function getAttempt(token: string) {
  const a = await prisma.attempt.findUnique({ where: { token } });
  if (!a) throw new Error("Phiên thi không tồn tại.");
  const questions = await hydrateQuestions(a);
  const result = (a.summary ?? a.result) as unknown as ExamResult | null;
  return {
    state: {
      id: a.id,
      info: a.info as unknown as UserInfo,
      config: a.config as unknown as ExamConfig,
      questions,
      answers: a.answers as Record<string, string>,
      currentIndex: 0,
      questionStartedAt: a.startTime.getTime(),
      startTime: a.startTime.getTime(),
      deadline: a.deadline.getTime(),
      result,
    },
    serverTime: Date.now(),
  };
}
export async function submitAttempt(token: string, answers: unknown) {
  for (let retry = 0; retry < 4; retry++)
    try {
      return await prisma.$transaction(
        async (tx) => {
          const a = await tx.attempt.findUnique({ where: { token } });
          if (!a) throw new Error("Phiên thi không tồn tại.");
          const questions = await hydrateQuestions(a, tx);
          const now = Date.now();
          let result = (a.summary ?? a.result) as unknown as ExamResult | null;
          let saved = a.answers as Record<string, string>;
          if (!a.submittedAt) {
            if (
              !answers ||
              typeof answers !== "object" ||
              Array.isArray(answers) ||
              Object.keys(answers).length > questions.length
            )
              throw new Error("Bài làm không hợp lệ.");
            const selected: Record<string, string> = {};
            const byId = new Map(questions.map((q) => [String(q.id), q]));
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
            // Offline submissions keep the same server deadline. Local time cannot extend the exam.
            const state: AttemptState = {
              id: a.id,
              info: a.info as unknown as UserInfo,
              config: a.config as unknown as ExamConfig,
              questions,
              answers: selected,
              currentIndex: 0,
              questionStartedAt: a.startTime.getTime(),
              startTime: a.startTime.getTime(),
              deadline: a.deadline.getTime(),
              result: null,
            };
            result = advanceAttempt(state, { action: "submit" }, now).result!;
            saved = selected;
            const summary = { ...result, answers: [] };
            await tx.attempt.update({
              where: { id: a.id },
              data: {
                answers: selected,
                summary: JSON.parse(JSON.stringify(summary)),
                submittedAt: new Date(result.submittedAt),
              },
            });
          }
          if (!result) throw new Error("Kết quả không hợp lệ.");
          const cfg = a.config as unknown as ExamConfig;
          const logs = questions.map((q) => ({
            questionId: q.id,
            selectedOption: saved[String(q.id)] || "",
            isCorrect: saved[String(q.id)] === q.correct,
            timeSpentSeconds: 0,
          }));
          return {
            state: {
              id: a.id,
              info: a.info as unknown as UserInfo,
              config: cfg,
              questions,
              answers: saved,
              currentIndex: 0,
              questionStartedAt: a.startTime.getTime(),
              startTime: a.startTime.getTime(),
              deadline: a.deadline.getTime(),
              result: { ...result, answers: cfg.allowReview ? logs : [] },
            },
            serverTime: now,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        retry < 3
      )
        continue;
      throw e;
    }
  throw new Error("Vui lòng thử lại.");
}
