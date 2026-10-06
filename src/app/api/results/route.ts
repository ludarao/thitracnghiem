import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  settings,
  isAdmin,
  checkOrigin,
  failure,
  token,
} from "../../../lib/server";
import { settleExpiredAttempts } from "../../../lib/attempt-service";
import { latestAttempts } from "../../../lib/attempt-state";
import type { ExamResult } from "../../../types/quiz";
export async function GET(req: NextRequest) {
  try {
    const s = await settings();
    const admin = await isAdmin(req);
    const history = req.nextUrl.searchParams.get("history") === "1";
    if (history && !admin)
      return NextResponse.json(
        { error: "Cần đăng nhập admin." },
        { status: 401 },
      );
    await settleExpiredAttempts(s.activeExamId);
    if (history) {
      const records = await prisma.attempt.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 500,
      });
      return NextResponse.json(
        {
          success: true,
          history: records.map((a) => ({
            ...(a.result as object),
            examId: a.examId,
          })),
          limit: 500,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const attempts = await prisma.attempt.findMany({
      where: { examId: s.activeExamId, submittedAt: { not: null } },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    });
    const results = latestAttempts(attempts).map((a) => {
      const result = a.result as unknown as ExamResult;
      return {
        ...result,
        answers: [],
        userInfo: {
          fullName: result.userInfo.fullName,
          rank: result.userInfo.rank,
          position: result.userInfo.position,
          unit: result.userInfo.unit,
          ...(admin
            ? {
                phone: result.userInfo.phone,
                candidateCode: result.userInfo.candidateCode,
              }
            : {}),
        },
      };
    });
    return NextResponse.json(
      {
        success: true,
        results,
        totalAttempts: attempts.length,
        config: s.config,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
// Bắt đầu kỳ thi mới, giữ nguyên lịch sử và cấu hình.
export async function DELETE(req: NextRequest) {
  try {
    checkOrigin(req);
    if (!(await isAdmin(req)))
      return NextResponse.json(
        { error: "Cần đăng nhập admin." },
        { status: 401 },
      );
    await settings();
    await prisma.quizSettings.update({
      where: { id: "main" },
      data: { activeExamId: token() },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e);
  }
}
