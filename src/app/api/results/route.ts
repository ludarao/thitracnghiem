import { RequestError } from "../../../lib/request-security";
import { publicCandidateCode } from "../../../lib/public-candidate-code";
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
import type { ExamConfig, ExamResult } from "../../../types/quiz";
const leaderboard = unstable_cache(
  async () => {
    const s = await settings();
    const rows = await prisma.$queryRaw<
      { summary: ExamResult; total: bigint }[]
    >`
 WITH submitted AS (SELECT "candidateId", "submittedAt", "id", "summary" FROM "Attempt" WHERE "examId"=${s.activeExamId} AND "submittedAt" IS NOT NULL)
 SELECT DISTINCT ON ("candidateId") "summary", (SELECT COUNT(*) FROM submitted) AS total FROM submitted ORDER BY "candidateId", ("summary"->>'score')::numeric DESC NULLS LAST, ("summary"->>'totalDurationSeconds')::numeric ASC NULLS LAST,"submittedAt" DESC,"id" DESC`;
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
      totalParticipants: minimal.length,
      ids: minimal.map((r) => r.id),
    };
  },
  ["public-leaderboard-fastest-v4"],
  { revalidate: 60, tags: ["quiz-leaderboard"] },
);
const participationCounts = unstable_cache(
  async () => {
    const s =
      (await prisma.quizSettings.findUnique({
        where: { id: "main" },
        select: { activeExamId: true, config: true },
      })) ?? (await settings());
    const rows = await prisma.$queryRaw<{ unit: string; count: bigint }[]>`
 WITH best AS (SELECT DISTINCT ON ("candidateId") "info" FROM "Attempt" WHERE "examId"=${s.activeExamId} AND "submittedAt" IS NOT NULL ORDER BY "candidateId",("summary"->>'score')::numeric DESC NULLS LAST,("summary"->>'totalDurationSeconds')::numeric ASC NULLS LAST,"submittedAt" DESC,"id" DESC)
 SELECT "info"->>'unit' AS unit, COUNT(*) AS count FROM best GROUP BY "info"->>'unit'`;
    const counts = new Map(rows.map((r) => [r.unit, Number(r.count)]));
    const names = new Set([
      ...(s.config as unknown as ExamConfig).units.map((u) => u.name),
      ...counts.keys(),
    ]);
    return {
      asOf: new Date().toISOString(),
      units: [...names]
        .map((unit) => ({ unit, participantCount: counts.get(unit) || 0 }))
        .sort(
          (a, b) =>
            b.participantCount - a.participantCount ||
            a.unit.localeCompare(b.unit, "vi"),
        ),
    };
  },
  ["quiz-participation-counts-fastest-v3"],
  { revalidate: 60, tags: ["quiz-leaderboard"] },
);
function pageNumber(value: string | null) {
  const page = Number(value || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw new RequestError("Trang không hợp lệ.", 400);
  return page;
}
const publicHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
};
function unitPage(
  snapshot: Awaited<ReturnType<typeof participationCounts>>,
  page: number,
) {
  const pageSize = 10;
  return {
    asOf: snapshot.asOf,
    units: snapshot.units.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalUnits: snapshot.units.length,
    totalPages: Math.max(1, Math.ceil(snapshot.units.length / pageSize)),
    hasMore: page * pageSize < snapshot.units.length,
  };
}
async function candidatePage(
  snapshot: Awaited<ReturnType<typeof leaderboard>>,
  page: number,
) {
  const pageSize = 20;
  const ids = snapshot.ids.slice((page - 1) * pageSize, page * pageSize);
  const results = !ids.length
    ? []
    : await unstable_cache(
        async () => {
          const records = await prisma.attempt.findMany({
            where: { id: { in: ids } },
            select: { summary: true },
          });
          const byId = new Map(
            records.map((a) => {
              const r = a.summary as unknown as ExamResult;
              // Explicit public fields; never send full identity, answers or monitoring.
              return [
                r.id,
                {
                  id: r.id,
                  score: r.score,
                  totalDurationSeconds: r.totalDurationSeconds,
                  isPassed: r.isPassed,
                  maskedCandidateCode: publicCandidateCode(r.userInfo),
                  userInfo: { unit: r.userInfo.unit },
                },
              ];
            }),
          );
          return ids.map((id) => byId.get(id)).filter(Boolean);
        },
        ["public-results-fastest-masked-v4", snapshot.asOf, String(page)],
        { revalidate: 60, tags: ["quiz-leaderboard"] },
      )();
  const { ids: unused, ...stats } = snapshot;
  return {
    ...stats,
    results,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(snapshot.totalParticipants / pageSize)),
    hasMore: page * pageSize < snapshot.totalParticipants,
  };
}
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("dashboard") === "1") {
      const requested = pageNumber(req.nextUrl.searchParams.get("page"));
      const requestedUnits = pageNumber(
        req.nextUrl.searchParams.get("unitsPage"),
      );
      const [snapshot, counts] = await Promise.all([
        leaderboard(),
        participationCounts(),
      ]);
      const page = Math.min(
        requested,
        Math.max(1, Math.ceil(snapshot.totalParticipants / 20)),
      );
      const unitsPage = Math.min(
        requestedUnits,
        Math.max(1, Math.ceil(counts.units.length / 10)),
      );
      const people = await candidatePage(snapshot, page);
      const units = unitPage(counts, unitsPage);
      const { config: unusedConfig, ...publicPeople } = people;
      return NextResponse.json(
        {
          success: true,
          ...publicPeople,
          units: units.units,
          unitsPage,
          unitsPageSize: units.pageSize,
          totalUnits: units.totalUnits,
          unitsTotalPages: units.totalPages,
          countsAsOf: units.asOf,
        },
        { headers: publicHeaders },
      );
    }
    if (req.nextUrl.searchParams.get("counts") === "1") {
      const page = pageNumber(req.nextUrl.searchParams.get("page"));
      return NextResponse.json(
        { success: true, ...unitPage(await participationCounts(), page) },
        { headers: publicHeaders },
      );
    }
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
    const page = pageNumber(req.nextUrl.searchParams.get("page"));
    return NextResponse.json(
      { success: true, ...(await candidatePage(await leaderboard(), page)) },
      { headers: publicHeaders },
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
