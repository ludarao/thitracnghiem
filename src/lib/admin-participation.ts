import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { settings } from "./server";
import type { ExamConfig, ExamResult } from "../types/quiz";

export const participationPageSize = 50;

type UnitCounts = {
  unit: string;
  participants: number;
  passed: number;
};

type ParticipationRow = {
  summary: ExamResult;
  phone: string;
  submittedAt: Date;
};

function bestAttempts(examId: string) {
  // Candidate.phone is unique and normalized at registration. Pick the best
  // attempt per phone across the whole exam before applying any unit filter.
  return Prisma.sql`
    WITH best AS (
      SELECT DISTINCT ON (c."phone")
        c."phone", a."id", a."submittedAt", a."summary", a."info"->>'unit' AS unit
      FROM "Attempt" a
      JOIN "Candidate" c ON c."id" = a."candidateId"
      WHERE a."examId" = ${examId}
        AND a."submittedAt" IS NOT NULL AND a."summary" IS NOT NULL
      ORDER BY c."phone", (a."summary"->>'score')::numeric DESC NULLS LAST,
        a."submittedAt" DESC, a."id" DESC
    )
  `;
}

function unitResults(
  best: Prisma.Sql,
  unit: string,
  pagination = Prisma.empty,
) {
  return prisma.$queryRaw<ParticipationRow[]>`
    ${best}
    SELECT "summary", "phone", "submittedAt"
    FROM best
    WHERE unit = ${unit}
    ORDER BY "submittedAt" DESC, "id" DESC
    ${pagination}
  `;
}

function toResult({
  summary,
  phone,
  submittedAt,
}: ParticipationRow): ExamResult {
  return {
    ...summary,
    userInfo: { ...summary.userInfo, phone },
    submittedAt: submittedAt.toISOString(),
  };
}

export async function getAdminParticipation(unit: string, page: number) {
  const exam = await settings();
  const config = exam.config as unknown as ExamConfig;
  const best = bestAttempts(exam.activeExamId);
  const countsQuery = prisma.$queryRaw<UnitCounts[]>`
    ${best}
    SELECT unit, COUNT(*)::int AS participants,
      (COUNT(*) FILTER (WHERE "summary"->'isPassed' = 'true'::jsonb))::int AS passed
    FROM best
    GROUP BY unit
    ORDER BY unit
  `;
  const [counts, rows] = unit
    ? await prisma.$transaction(
        [
          countsQuery,
          unitResults(
            best,
            unit,
            Prisma.sql`
            LIMIT ${participationPageSize} OFFSET ${(page - 1) * participationPageSize}
          `,
          ),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      )
    : [await countsQuery, []];
  const units = new Map<string, UnitCounts>(
    config.units.map(({ name }) => [
      name,
      { unit: name, participants: 0, passed: 0 },
    ]),
  );
  for (const count of counts) units.set(count.unit, count);

  return {
    title: config.title,
    units: [...units.values()],
    totals: counts.reduce(
      (total, count) => ({
        participants: total.participants + count.participants,
        passed: total.passed + count.passed,
      }),
      { participants: 0, passed: 0 },
    ),
    results: rows.map(toResult),
  };
}

export async function getUnitResults(unit: string) {
  const { activeExamId } = await settings();
  const rows = await unitResults(bestAttempts(activeExamId), unit);
  return rows.map(toResult);
}
