import type { ExamConfig, Question, QuestionSet } from "../types/quiz";

/** Prepare the old flat bank for editing without changing saved data. */
export function editableQuestionSets(
  config: ExamConfig,
  questions: Question[],
) {
  if (config.questionSets !== undefined) return { config, questions };
  return {
    config: {
      ...config,
      questionSets: [
        { id: "legacy", name: "Bộ 1", questionCount: config.questionCount },
      ],
    },
    questions: questions.map((q) => ({ ...q, setId: "legacy" })),
  };
}

export function validateQuestionSetPlan(
  config: Pick<ExamConfig, "questionSets" | "questionCount">,
  questions: Question[],
): QuestionSet[] | undefined {
  if (config.questionSets === undefined) return undefined;
  const sets = config.questionSets;
  if (!Array.isArray(sets) || !sets.length || sets.length > 1000)
    throw new Error("Cần từ 1 đến 1000 bộ câu hỏi.");
  const ids = new Set<string>();
  const names = new Set<string>();
  const counts = new Map<string, number>();
  let total = 0;
  for (const set of sets) {
    if (
      !set ||
      typeof set.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(set.id) ||
      ids.has(set.id)
    )
      throw new Error("Mã bộ câu hỏi không hợp lệ hoặc bị trùng.");
    if (
      typeof set.name !== "string" ||
      !set.name.trim() ||
      set.name.trim().length > 120 ||
      names.has(set.name.trim().toLocaleLowerCase("vi"))
    )
      throw new Error(
        "Tên bộ câu hỏi phải khác nhau và có từ 1 đến 120 ký tự.",
      );
    if (
      !Number.isInteger(set.questionCount) ||
      set.questionCount < 0 ||
      set.questionCount > 10000
    )
      throw new Error(`Số câu lấy từ ${set.name} phải là số nguyên không âm.`);
    ids.add(set.id);
    names.add(set.name.trim().toLocaleLowerCase("vi"));
    counts.set(set.id, 0);
    total += set.questionCount;
  }
  for (const question of questions) {
    if (!question.setId || !ids.has(question.setId))
      throw new Error(
        "Có câu hỏi chưa thuộc bộ hợp lệ. Vui lòng nạp lại đúng bộ.",
      );
    counts.set(question.setId, counts.get(question.setId)! + 1);
  }
  for (const set of sets) {
    const available = counts.get(set.id)!;
    if (set.questionCount > available)
      throw new Error(
        `${set.name} chỉ có ${available} câu, không thể lấy ${set.questionCount} câu.`,
      );
  }
  if (total !== config.questionCount)
    throw new Error(
      `Tổng số câu phân bổ là ${total}, cần đúng ${config.questionCount} câu của mỗi đề thi.`,
    );
  return sets.map((set) => ({
    id: set.id,
    name: set.name.trim(),
    questionCount: set.questionCount,
  }));
}

/** IDs in separate Excel files may all start at 1. Keep other sets' IDs stable. */
export function replaceQuestionSet(
  questions: Question[],
  setId: string,
  incoming: Question[],
) {
  const remaining = questions.filter((q) => q.setId !== setId);
  let id = remaining.reduce((max, q) => Math.max(max, q.id), 0);
  if (remaining.length + incoming.length > 10000)
    throw new Error("Tổng ngân hàng tối đa 10000 câu.");
  if (!Number.isSafeInteger(id + incoming.length))
    throw new Error("ID câu hỏi vượt giới hạn. Vui lòng kiểm tra ngân hàng.");
  return [...remaining, ...incoming.map((q) => ({ ...q, id: ++id, setId }))];
}

export function selectExamQuestions(
  questions: Question[],
  config: ExamConfig,
  shuffle: <T>(values: T[]) => T[],
) {
  const sets = validateQuestionSetPlan(config, questions);
  if (!sets)
    return (config.shuffleQuestions ? shuffle(questions) : questions).slice(
      0,
      config.questionCount,
    );
  const pools = new Map(sets.map((set) => [set.id, [] as Question[]]));
  for (const question of questions) pools.get(question.setId!)!.push(question);
  const selected = sets.flatMap((set) => {
    if (set.questionCount === 0) return [];
    const pool = pools.get(set.id)!;
    return (config.shuffleQuestions ? shuffle(pool) : pool).slice(
      0,
      set.questionCount,
    );
  });
  return config.shuffleQuestions ? shuffle(selected) : selected;
}
