// Run only against an isolated localhost app/database; never production.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
const base = process.env.LOAD_TEST_URL || "http://127.0.0.1:3097";
const dbURL = process.env.LOAD_TEST_DATABASE_URL;
if (!dbURL)
  throw new Error(
    "LOAD_TEST_DATABASE_URL must point to a fresh isolated quiz_load database.",
  );
for (const address of [new URL(base), new URL(dbURL)])
  if (!["127.0.0.1", "localhost"].includes(address.hostname))
    throw new Error("This benchmark only accepts localhost.");
if (!/^\/quiz_load(?:_fixed|_verified)?$/.test(new URL(dbURL).pathname))
  throw new Error("Use only the disposable quiz_load database.");
const prisma = new PrismaClient({ datasourceUrl: dbURL });
if ((await prisma.attempt.count()) || (await prisma.candidate.count()))
  throw new Error(
    "Database must be fresh; existing attempts are never deleted.",
  );
const report = {
  date: new Date().toISOString(),
  environment: {
    scope:
      "localhost production Next.js + real PostgreSQL; no CDN, WAN or Vercel autoscaling",
    postgres: await prisma.$queryRaw`SELECT version()`,
    participants: 5000,
    concurrentRequests: 500,
    questions: 30,
    prismaConnections: 10,
    requestTimeoutMs: 20000,
  },
  phases: [],
  errors: [],
};
const results = new Map();
async function call(path, options = {}) {
  const started = performance.now();
  try {
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    return {
      ms: performance.now() - started,
      ok: response.ok && data.success !== false,
      status: response.status,
      data,
    };
  } catch (e) {
    return {
      ms: performance.now() - started,
      ok: false,
      status: 0,
      data: { error: e.name },
    };
  }
}
async function phase(name, jobs) {
  const started = performance.now();
  const rows = await Promise.all(jobs.map((fn) => fn()));
  const elapsed = performance.now() - started;
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  report.phases.push({
    name,
    requests: rows.length,
    success: rows.filter((r) => r.ok).length,
    failed: rows.filter((r) => !r.ok).length,
    elapsedMs: Math.round(elapsed),
    p50Ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1] || 0),
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] || 0),
    maxMs: Math.round(sorted.at(-1) || 0),
  });
  for (const r of rows.filter((r) => !r.ok))
    if (report.errors.length < 10)
      report.errors.push({
        phase: name,
        status: r.status,
        error: r.data.error,
      });
  console.log(JSON.stringify(report.phases.at(-1)));
  return rows;
}
try {
  const config = await call("/api/config");
  if (!config.ok || config.data.config.questionCount !== 30)
    throw new Error("Expected isolated open exam with 30 questions.");
  await phase(
    "config-500",
    Array.from({ length: 500 }, () => () => call("/api/config")),
  );
  let firstBatch = [];
  for (let batch = 0; batch < 10; batch++) {
    const starts = await phase(
      `start-${batch + 1}`,
      Array.from({ length: 500 }, (_, offset) => () => {
        const i = batch * 500 + offset;
        return call("/api/exam", {
          method: "POST",
          body: JSON.stringify({
            userInfo: {
              fullName: "Thí sinh kiểm thử " + i,
              phone: "09" + String(10000000 + i),
              rank: "Kiểm thử",
              position: "Kiểm thử",
              unit: config.data.config.units[i % 10].name,
            },
          }),
        });
      }),
    );
    const sessions = starts
      .filter((r) => r.ok)
      .map((r) => ({
        token: r.data.token,
        id: r.data.id,
        answers: Object.fromEntries(r.data.questions.map((q) => [q.id, "A"])),
      }));
    if (batch === 0) firstBatch = sessions;
    const submissions = await phase(
      `submit-${batch + 1}`,
      sessions.map(
        (s) => () =>
          call("/api/exam", {
            method: "PATCH",
            headers: { Authorization: "Bearer " + s.token },
            body: JSON.stringify({ action: "submit", answers: s.answers }),
          }),
      ),
    );
    submissions
      .filter((r) => r.ok)
      .forEach((r) => results.set(r.data.id, r.data.result));
  }
  const retries = await phase(
    "retry-500",
    firstBatch.map(
      (s) => () =>
        call("/api/exam", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + s.token },
          body: JSON.stringify({ action: "submit", answers: {} }),
        }),
    ),
  );
  report.idempotent = retries.every(
    (r) => r.ok && isDeepStrictEqual(r.data.result, results.get(r.data.id)),
  );
  // Cache could still contain a preceding snapshot: counts are checked after expiry.
  const dashboards = await phase(
    "dashboard-500",
    Array.from({ length: 500 }, () => () => call("/api/results?counts=1")),
  );
  report.dashboardCountsCorrect = dashboards.every(
    (r) =>
      r.ok &&
      r.data.units.length === 10 &&
      r.data.units.every((u) => u.participantCount === 500),
  );
  const race = await call("/api/exam", {
    method: "POST",
    body: JSON.stringify({
      userInfo: {
        fullName: "Thí sinh kiểm thử 0",
        phone: "0910000000",
        rank: "Kiểm thử",
        position: "Kiểm thử",
        unit: config.data.config.units[0].name,
      },
    }),
  });
  if (!race.ok) throw new Error("Race attempt creation failed");
  const same = await phase(
    "same-attempt-race-500",
    Array.from(
      { length: 500 },
      (_, i) => () =>
        call("/api/exam", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + race.data.token },
          body: JSON.stringify({
            action: "submit",
            answers: Object.fromEntries(
              race.data.questions.map((q) => [q.id, i % 2 ? "A" : "B"]),
            ),
          }),
        }),
    ),
  );
  report.sameAttemptRace = same.every(
    (r) => r.ok && isDeepStrictEqual(r.data.result, same[0].data.result),
  );
  report.persisted = {
    candidates: await prisma.candidate.count(),
    attempts: await prisma.attempt.count(),
    submitted: await prisma.attempt.count({
      where: { submittedAt: { not: null } },
    }),
    questionBanks: await prisma.questionBank.count(),
  };
  report.unitCounts =
    await prisma.$queryRaw`WITH latest AS (SELECT DISTINCT ON ("candidateId") "info" FROM "Attempt" WHERE "submittedAt" IS NOT NULL ORDER BY "candidateId","submittedAt" DESC,"id" DESC) SELECT "info"->>'unit' AS unit, COUNT(*)::int AS count FROM latest GROUP BY "info"->>'unit' ORDER BY unit`;
  report.storage =
    await prisma.$queryRaw`SELECT relname AS table, pg_total_relation_size(relid)::bigint AS bytes FROM pg_stat_user_tables ORDER BY relname`;
  report.databaseBytes =
    await prisma.$queryRaw`SELECT pg_database_size(current_database()) AS bytes`;
  report.loadGeneratorCpu = process.cpuUsage();
  writeFileSync(
    "reports/load-test-5000-500.json",
    JSON.stringify(
      report,
      (_, value) => (typeof value === "bigint" ? Number(value) : value),
      2,
    ) + "\n",
  );
  if (
    report.phases.some((p) => p.failed) ||
    !report.idempotent ||
    !report.sameAttemptRace ||
    !report.dashboardCountsCorrect ||
    report.persisted.submitted !== 5001
  )
    process.exitCode = 1;
  console.log(
    JSON.stringify({
      persisted: report.persisted,
      idempotent: report.idempotent,
      errors: report.errors,
    }),
  );
} finally {
  await prisma.$disconnect();
}
