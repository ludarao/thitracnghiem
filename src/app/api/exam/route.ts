import {
  authorizeAttemptToken,
  issueAttemptToken,
  limitAttemptRequests,
} from "../../../lib/attempt-security";
import { protectionSettings } from "../../../lib/local-exam-guard";
import {
  readLimitedJson,
  verifyTurnstile,
} from "../../../lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  settings,
  token,
  digest,
  checkOrigin,
  failure,
} from "../../../lib/server";
import { candidateIdentity } from "../../../lib/candidate-identity";
import { getAttempt, submitAttempt } from "../../../lib/attempt-service";
import {
  saveBank,
  questionRefs,
  hydrateQuestions,
} from "../../../lib/question-bank";
import type {
  ExamConfig,
  Question,
  UserInfo,
  ExamResult,
} from "../../../types/quiz";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const body = await readLimitedJson(req, 128 * 1024);
    await verifyTurnstile(
      body.verificationToken,
      "exam_start",
      req.nextUrl.hostname,
    );
    const info = body.userInfo as UserInfo;
    const s = await settings();
    const existingConfig = s.config as unknown as ExamConfig;
    const cfg = { ...existingConfig, ...protectionSettings(existingConfig) };
    if (!cfg.isOpen) throw new Error("Kỳ thi đang đóng.");
    if (
      !info ||
      typeof info.unit !== "string" ||
      !cfg.units.some((u) => u.name === info.unit)
    )
      throw new Error("Vui lòng chọn đơn vị trong danh sách.");
    const identity = candidateIdentity(info.nameInitials, info.phone);
    const snapshot = {
      ...identity,
      unit: info.unit,
    };
    const candidate = await prisma.candidate.upsert({
      where: { code: identity.candidateCode },
      update: {},
      create: {
        phone: identity.phone,
        code: identity.candidateCode,
        info: snapshot,
      },
    });
    const raw = issueAttemptToken();
    const now = new Date();
    const bankId = await saveBank(s.questions as unknown as Question[]);
    const { units, ...attemptConfig } = cfg;
    const attempt = await prisma.$transaction(async (tx) => {
      // Serialize the final insertion against an Admin purge/period change.
      const [current] = await tx.$queryRaw<
        { activeExamId: string; config: ExamConfig }[]
      >`
        SELECT "activeExamId", "config" FROM "QuizSettings" WHERE "id" = 'main' FOR SHARE`;
      if (
        !current ||
        current.activeExamId !== s.activeExamId ||
        !current.config.isOpen
      )
        throw new Error(
          "Kỳ thi đã đóng hoặc thay đổi. Vui lòng tải lại trang.",
        );
      return tx.attempt.create({
        data: {
          token: digest(raw),
          candidateId: candidate.id,
          examId: s.activeExamId,
          info: JSON.parse(JSON.stringify(snapshot)),
          config: JSON.parse(
            JSON.stringify({ ...attemptConfig, attemptTokenVersion: 2 }),
          ),
          bankId,
          questions: JSON.parse(
            JSON.stringify(
              questionRefs(s.questions as unknown as Question[], cfg),
            ),
          ),
          answers: {},
          startTime: now,
          questionStartedAt: now,
          deadline: new Date(now.getTime() + cfg.totalTimeMinutes * 60000),
        },
      });
    });
    // Return the complete public session in the start response: no follow-up GET.
    const prepared = await hydrateQuestions(attempt);
    return NextResponse.json(
      {
        success: true,
        token: raw,
        id: attempt.id,
        candidateCode: candidate.code,
        userInfo: snapshot,
        config: { ...attemptConfig, units: cfg.units },
        questions: prepared.map((q) => ({ ...q, correct: undefined })),
        answers: {},
        currentIndex: 0,
        serverTime: now.getTime(),
        deadline: attempt.deadline.toISOString(),
        result: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: NextRequest) {
  return processAttempt(req, false);
}
export async function PATCH(req: NextRequest) {
  return processAttempt(req, true);
}
async function processAttempt(req: NextRequest, mutate: boolean) {
  try {
    if (mutate) checkOrigin(req);
    const raw = await authorizeAttemptToken(
      req.headers.get("authorization")?.replace(/^Bearer /, ""),
    );
    limitAttemptRequests(raw, mutate);
    const body = mutate ? await readLimitedJson(req, 128 * 1024) : {};
    if (mutate && body.action !== "submit")
      return NextResponse.json(
        { error: "Chỉ gửi bài khi nộp; tiến độ được lưu trên máy." },
        { status: 400 },
      );
    const { state, serverTime } = mutate
      ? await submitAttempt(digest(raw), body.answers, body.localMonitoring)
      : await getAttempt(digest(raw));
    const {
      id,
      info: userInfo,
      config,
      answers,
      currentIndex,
      deadline,
      questionStartedAt,
      result,
      questions,
    } = state;
    return NextResponse.json(
      {
        success: true,
        id,
        userInfo,
        config: { ...config, units: config.units || [] },
        answers,
        currentIndex,
        serverTime,
        deadline: new Date(deadline).toISOString(),
        result:
          result && !config.allowReview ? { ...result, answers: [] } : result,
        questions: questions.map((q, i) =>
          result && config.allowReview
            ? q
            : {
                ...q,
                correct: undefined,
              },
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
