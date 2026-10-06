import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  advanceAttempt,
  type AttemptAction,
  type AttemptState,
} from "./attempt-state";
import type { ExamConfig, ExamResult, Question, UserInfo } from "../types/quiz";

export async function updateAttempt(
  where: { id: string } | { token: string },
  action: AttemptAction = {},
) {
  for (let retry = 0; retry < 4; retry++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const attempt = await tx.attempt.findUnique({ where });
          if (!attempt) throw new Error("Phiên thi không tồn tại.");
          const now = Date.now();
          const state: AttemptState = advanceAttempt(
            {
              id: attempt.id,
              info: attempt.info as unknown as UserInfo,
              config: attempt.config as unknown as ExamConfig,
              questions: attempt.questions as unknown as Question[],
              answers: attempt.answers as Record<string, string>,
              currentIndex: attempt.currentIndex,
              questionStartedAt: attempt.questionStartedAt.getTime(),
              startTime: attempt.startTime.getTime(),
              deadline: attempt.deadline.getTime(),
              result: attempt.result as unknown as ExamResult | null,
            },
            action,
            now,
          );
          if (!attempt.submittedAt) {
            await tx.attempt.update({
              where: { id: attempt.id },
              data: {
                answers: state.answers,
                currentIndex: state.currentIndex,
                questionStartedAt: new Date(state.questionStartedAt),
                version: { increment: 1 },
                ...(state.result
                  ? {
                      submittedAt: new Date(state.result.submittedAt),
                      result: JSON.parse(JSON.stringify(state.result)),
                    }
                  : {}),
              },
            });
          }
          return { state, serverTime: now };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        retry < 3
      )
        continue;
      throw error;
    }
  }
  throw new Error("Vui lòng thử lại.");
}

/** Settle abandoned expired attempts too, so closing a tab cannot avoid automatic submission. */
export async function settleExpiredAttempts(examId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { examId, submittedAt: null },
  });
  const now = Date.now();
  for (const attempt of attempts) {
    const cfg = attempt.config as unknown as ExamConfig;
    const questions = attempt.questions as unknown as Question[];
    const finalQuestionDeadline =
      cfg.timePerQuestionSeconds > 0
        ? attempt.questionStartedAt.getTime() +
          (questions.length - attempt.currentIndex) *
            cfg.timePerQuestionSeconds *
            1000
        : Infinity;
    if (now >= Math.min(attempt.deadline.getTime(), finalQuestionDeadline))
      await updateAttempt({ id: attempt.id });
  }
}
