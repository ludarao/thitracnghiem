import { createHash, randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import type { ExamConfig, Question } from "../types/quiz";
type Key = keyof Question["options"];
export type QuestionRef = { id: number; order: Key[] };
const cache = new Map<string, Promise<Question[]>>();
function shuffled<T>(values: T[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export async function saveBank(questions: Question[]) {
  const id = createHash("sha256")
    .update(JSON.stringify(questions))
    .digest("hex");
  if (!cache.has(id)) {
    const pending = prisma.questionBank
      .upsert({
        where: { id },
        update: {},
        create: { id, questions: JSON.parse(JSON.stringify(questions)) },
      })
      .then(() => questions)
      .catch((e) => {
        cache.delete(id);
        throw e;
      });
    cache.set(id, pending);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  await cache.get(id);
  return id;
}
export async function readBank(
  id: string,
  db: Pick<PrismaClient, "questionBank"> = prisma,
) {
  if (!cache.has(id)) {
    const pending = db.questionBank
      .findUnique({ where: { id } })
      .then((bank) => {
        if (!bank) throw new Error("Không tìm thấy phiên bản đề.");
        return bank.questions as unknown as Question[];
      })
      .catch((e) => {
        cache.delete(id);
        throw e;
      });
    cache.set(id, pending);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  return cache.get(id)!;
}
export function questionRefs(
  questions: Question[],
  config: ExamConfig,
): QuestionRef[] {
  return (config.shuffleQuestions ? shuffled(questions) : questions)
    .slice(0, config.questionCount)
    .map((q) => ({
      id: q.id,
      order: config.shuffleOptions
        ? shuffled<Key>(["A", "B", "C", "D"])
        : ["A", "B", "C", "D"],
    }));
}
export async function hydrateQuestions(
  attempt: {
    bankId: string | null;
    questions: unknown;
  },
  db: Pick<PrismaClient, "questionBank"> = prisma,
): Promise<Question[]> {
  if (!attempt.bankId) return attempt.questions as Question[];
  const bank = new Map(
    (await readBank(attempt.bankId, db)).map((q) => [q.id, q]),
  );
  const keys: Key[] = ["A", "B", "C", "D"];
  return (attempt.questions as QuestionRef[]).map((ref) => {
    const q = bank.get(ref.id);
    if (!q) throw new Error("Đề không hợp lệ.");
    return {
      ...q,
      options: Object.fromEntries(
        ref.order.map((key, i) => [keys[i], q.options[key]]),
      ) as Question["options"],
      correct: keys[ref.order.indexOf(q.correct as Key)],
    };
  });
}
