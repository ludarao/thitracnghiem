import test from "node:test";
import assert from "node:assert/strict";
import { databaseUrls } from "../src/lib/database-url.mjs";
test("Vercel Prisma: chọn URL PostgreSQL, không đưa URL Accelerate vào migration", () => {
  const env = {
    DATABASE_URL: "prisma+postgres://example",
    DATABASE_POSTGRES_URL: "postgres://test/db",
  };
  assert.deepEqual(databaseUrls(env), {
    runtime: "postgres://test/db",
    direct: "postgres://test/db",
  });
});
test("URL migration trực tiếp được ưu tiên, DATABASE_URL tiêu chuẩn được giữ", () => {
  assert.deepEqual(
    databaseUrls({
      DATABASE_URL: "postgresql://runtime/db",
      DATABASE_URL_UNPOOLED: "postgresql://direct/db",
    }),
    { runtime: "postgresql://runtime/db", direct: "postgresql://direct/db" },
  );
});
