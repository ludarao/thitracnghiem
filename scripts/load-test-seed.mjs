import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const url = process.env.LOAD_TEST_DATABASE_URL;
if (!url) throw new Error("Provide LOAD_TEST_DATABASE_URL.");
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  !/^\/quiz_load(?:_fixed|_verified)?$/.test(parsed.pathname)
)
  throw new Error("Only a disposable localhost quiz_load database is allowed.");
const p = new PrismaClient({ datasourceUrl: url });
try {
  if (
    (await p.quizSettings.count()) ||
    (await p.candidate.count()) ||
    (await p.attempt.count())
  )
    throw new Error(
      "Only a fresh database can be seeded. Existing data is never removed.",
    );
  await p.quizSettings.create({
    data: {
      id: "main",
      activeExamId: "load-test",
      config: {
        title: "Isolated load test",
        description: "Test fixture",
        totalTimeMinutes: 20,
        questionCount: 30,
        shuffleQuestions: true,
        shuffleOptions: true,
        passingScorePercent: 80,
        allowReview: true,
        isOpen: true,
        units: Array.from({ length: 10 }, (_, i) => ({
          name: "Đơn vị kiểm thử " + i,
          targetCount: 500,
        })),
      },
      questions: JSON.parse(
        readFileSync(
          new URL("../src/data/questions.json", import.meta.url),
          "utf8",
        ),
      ),
    },
  });
} finally {
  await p.$disconnect();
}
