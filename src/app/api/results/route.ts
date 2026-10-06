import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "../../../lib/prisma";
import {
  settings,
  isAdmin,
  checkOrigin,
  failure,
  token,
} from "../../../lib/server";
import { calculateCollectiveRanks } from "../../../lib/storage";
import type { ExamConfig, ExamResult } from "../../../types/quiz";
const leaderboard = unstable_cache(
  async () => {
    const s = await settings();
    const rows = await prisma.$queryRaw<
      { summary: ExamResult; total: bigint }[]
    >`
 WITH submitted AS (SELECT "candidateId", "submittedAt", "id", "summary" FROM "Attempt" WHERE "examId"=${s.activeExamId} AND "submittedAt" IS NOT NULL)
 SELECT DISTINCT ON ("candidateId") "summary", (SELECT COUNT(*) FROM submitted) AS total FROM submitted ORDER BY "candidateId", "submittedAt" DESC,"id" DESC`;
    const minimal = rows.map(({ summary: r }) => ({
      id: r.id,
      score: r.score,
      totalDurationSeconds: r.totalDurationSeconds,
      isPassed: r.isPassed,
      userInfo: { unit: r.userInfo.unit },
    }));
    minimal.sort(
      (a, b) =>
        b.score - a.score ||
        a.totalDurationSeconds - b.totalDurationSeconds ||
        a.id.localeCompare(b.id),
    );
    return {
      config: s.config,
      totalAttempts: Number(rows[0]?.total || 0),
      asOf: new Date().toISOString(),
      ranks: calculateCollectiveRanks(
        minimal as ExamResult[],
        (s.config as unknown as ExamConfig).units,
      ),
      totalParticipants: minimal.length,
      averageScore: minimal.length
        ? minimal.reduce((sum, r) => sum + r.score, 0) / minimal.length
        : 0,
      passedCount: minimal.filter((r) => r.isPassed).length,
      ids: minimal.map((r) => r.id),
    };
  },
  ["public-leaderboard-v2"],
  { revalidate: 60, tags: ["quiz-leaderboard"] },
);
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("history") === "1") {
      if (!(await isAdmin(req)))
        return NextResponse.json(
          { error: "Cần đăng nhập admin." },
          { status: 401 },
        );
      const cursor = req.nextUrl.searchParams.get("cursor");
      let boundary: { date: Date; id: string } | null = null;
      if (cursor) {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
        boundary = { date: new Date(parsed.date), id: parsed.id };
        if (
          !Number.isFinite(boundary.date.getTime()) ||
          typeof boundary.id !== "string"
        )
          throw new Error("Trang không hợp lệ.");
      }
      const records = await prisma.attempt.findMany({
        where: {
          submittedAt: { not: null },
          ...(boundary
            ? {
                OR: [
                  { submittedAt: { lt: boundary.date } },
                  { submittedAt: boundary.date, id: { lt: boundary.id } },
                ],
              }
            : {}),
        },
        select: { id: true, examId: true, submittedAt: true, summary: true },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 51,
      });
      const page = records.slice(0, 50);
      const last = page[page.length - 1];
      return NextResponse.json(
        {
          success: true,
          history: page.map((a) => ({
            ...(a.summary as object),
            examId: a.examId,
          })),
          nextCursor:
            records.length > 50 && last
              ? Buffer.from(
                  JSON.stringify({ date: last.submittedAt, id: last.id }),
                ).toString("base64url")
              : null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const snapshot = await leaderboard();
    const requested = Number(req.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(requested) || requested < 1 || requested > 100000)
      throw new Error("Trang không hợp lệ.");
    const pageSize = 100;
    const ids = snapshot.ids.slice(
      (requested - 1) * pageSize,
      requested * pageSize,
    );
    const results = await unstable_cache(
      async () => {
        const records = await prisma.attempt.findMany({
          where: { id: { in: ids } },
          select: { summary: true },
        });
        const byId = new Map(
          records.map((a) => {
            const r = a.summary as unknown as ExamResult;
            return [
              r.id,
              {
                ...r,
                answers: [],
                userInfo: {
                  fullName: r.userInfo.fullName,
                  rank: r.userInfo.rank,
                  position: r.userInfo.position,
                  unit: r.userInfo.unit,
                },
              },
            ];
          }),
        );
        return ids.map((id) => byId.get(id)).filter(Boolean);
      },
      ["public-results-page-v2", snapshot.asOf, String(requested)],
      { revalidate: 60, tags: ["quiz-leaderboard"] },
    )();
    const { ids: unused, ...stats } = snapshot;
    return NextResponse.json(
      {
        success: true,
        ...stats,
        results,
        page: requested,
        pageSize,
        hasMore: requested * pageSize < snapshot.totalParticipants,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
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
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag("quiz-leaderboard", { expire: 0 });
    revalidateTag("quiz-config", { expire: 0 });
    revalidatePath("/api/results");
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e);
  }
}
