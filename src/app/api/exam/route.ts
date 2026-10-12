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
import { normalizeServiceNumber } from "../../../lib/quiz-rules";
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
    const cfg = s.config as unknown as ExamConfig;
    if (!cfg.isOpen) throw new Error("Kỳ thi đang đóng.");
    if (
      !info ||
      typeof info.unit !== "string" ||
      !cfg.units.some((u) => u.name === info.unit)
    )
      throw new Error("Vui lòng chọn đơn vị trong danh sách.");
    const serviceNumber = normalizeServiceNumber(info.serviceNumber);
    const snapshot = {
      serviceNumber,
      candidateCode: serviceNumber,
      unit: info.unit,
    };
    const candidate = await prisma.candidate.upsert({
      where: { code: serviceNumber },
      update: {},
      create: { phone: null, code: serviceNumber, info: snapshot },
    });
    const raw = token();
    const now = new Date();
    const bankId = await saveBank(s.questions as unknown as Question[]);
    const { units, ...attemptConfig } = cfg;
    const attempt = await prisma.attempt.create({
      data: {
        token: digest(raw),
        candidateId: candidate.id,
        examId: s.activeExamId,
        info: JSON.parse(JSON.stringify(snapshot)),
        config: JSON.parse(JSON.stringify(attemptConfig)),
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
    const raw = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!raw || !/^[a-f0-9]{64}$/.test(raw))
      return NextResponse.json(
        { error: "Thiếu mã phiên thi." },
        { status: 401 },
      );
    const body = mutate ? await readLimitedJson(req, 128 * 1024) : {};
    if (mutate && body.action !== "submit")
      return NextResponse.json(
        { error: "Chỉ gửi bài khi nộp; tiến độ được lưu trên máy." },
        { status: 400 },
      );
    const { state, serverTime } = mutate
      ? await submitAttempt(digest(raw), body.answers)
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
