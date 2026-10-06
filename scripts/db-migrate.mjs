import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { databaseUrls } from "../src/lib/database-url.mjs";

for (const file of [".env.local", ".env"])
  if (existsSync(file)) process.loadEnvFile(file);
const urls = databaseUrls(process.env);
if (!urls.runtime || !urls.direct)
  throw new Error(
    "Thiếu URL PostgreSQL. Cấu hình DATABASE_URL hoặc DATABASE_POSTGRES_URL trên Vercel.",
  );
process.env.DATABASE_URL = urls.runtime;
process.env.DATABASE_URL_UNPOOLED = urls.direct;
const run = (args) => {
  const child = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", env: process.env },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Prisma ${args[0]} thất bại.`);
};
// The existing app may have created ExamResult with db push, without migration history.
// Baseline only the matching original schema; migration deploy adds the new tables.
const db = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_UNPOOLED,
});
try {
  const [tables] =
    await db.$queryRaw`SELECT to_regclass('public."ExamResult"')::text AS legacy, to_regclass('public._prisma_migrations')::text AS migrations`;
  if (tables.legacy) {
    let recorded = false;
    if (tables.migrations) {
      const rows =
        await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '202610060001_legacy' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      recorded = rows.length > 0;
    }
    if (!recorded) {
      const columns =
        await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ExamResult'`;
      const expected = [
        "id",
        "fullName",
        "rank",
        "position",
        "unit",
        "score",
        "correctCount",
        "totalQuestions",
        "percentage",
        "isPassed",
        "totalDurationSeconds",
        "startTime",
        "endTime",
        "submittedAt",
        "answersJson",
      ];
      if (
        !expected.every((name) => columns.some((c) => c.column_name === name))
      )
        throw new Error(
          "Bảng ExamResult khác schema gốc; cần kiểm tra trước khi baseline.",
        );
      run(["migrate", "resolve", "--applied", "202610060001_legacy"]);
    }
  }
} finally {
  await db.$disconnect();
}
run(["migrate", "deploy"]);
