import { NextRequest, NextResponse } from "next/server";
import { settings, isAdmin, checkOrigin, failure } from "../../../lib/server";
import { prisma } from "../../../lib/prisma";
import { validateConfig, validateQuestions } from "../../../lib/quiz-rules";
import type { ExamConfig } from "../../../types/quiz";
export async function GET(req: NextRequest) {
  try {
    const s = await settings();
    const admin = await isAdmin(req);
    return NextResponse.json(
      {
        success: true,
        config: s.config,
        examId: s.activeExamId,
        ...(admin ? { questions: s.questions } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: NextRequest) {
  try {
    checkOrigin(req);
    if (!(await isAdmin(req)))
      return NextResponse.json(
        { error: "Cần đăng nhập admin." },
        { status: 401 },
      );
    const body = await req.json();
    const old = await settings();
    const questions = validateQuestions(body.questions ?? old.questions);
    const config = validateConfig(body.config as ExamConfig, questions.length);
    const s = await prisma.quizSettings.update({
      where: { id: "main" },
      data: {
        config: JSON.parse(JSON.stringify(config)),
        questions: JSON.parse(JSON.stringify(questions)),
      },
    });
    return NextResponse.json({
      success: true,
      config: s.config,
      questions: s.questions,
    });
  } catch (e) {
    return failure(e);
  }
}
