import { randomInt } from "node:crypto";
import type { ExamConfig, Question } from "../types/quiz";
export function normalizeServiceNumber(value: unknown): string {
  if (typeof value !== "string") throw new Error("Vui lòng nhập số hiệu.");
  const number = value.trim();
  if (!/^\d{3}-?\d{3}$/.test(number))
    throw new Error("Số hiệu phải có đúng 6 chữ số, ví dụ 650-695.");
  const digits = number.replace("-", "");
  return digits.slice(0, 3) + "-" + digits.slice(3);
}
export function normalizePhone(value: string) {
  let phone = value.replace(/[\s().-]/g, "");
  if (phone.startsWith("+84")) phone = "0" + phone.slice(3);
  if (!/^0[35789]\d{8}$/.test(phone))
    throw new Error("Số điện thoại di động Việt Nam không hợp lệ.");
  return phone;
}
export function candidateCode(name: string, phone: string) {
  const initials = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "D")
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials + normalizePhone(phone);
}
export function validateQuestions(value: unknown): Question[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000)
    throw new Error("Ngân hàng phải có từ 1 đến 10000 câu.");
  const ids = new Set<number>();
  for (const q of value) {
    if (!Number.isInteger(q.id) || q.id < 1 || ids.has(q.id))
      throw new Error("ID câu hỏi không hợp lệ hoặc bị trùng.");
    ids.add(q.id);
    if (
      typeof q.question !== "string" ||
      !q.question.trim() ||
      !q.options ||
      !["A", "B", "C", "D"].includes(q.correct)
    )
      throw new Error("Câu hỏi hoặc đáp án đúng không hợp lệ.");
    for (const key of ["A", "B", "C", "D"])
      if (typeof q.options[key] !== "string")
        throw new Error("Lựa chọn phải là văn bản.");
    if (
      !q.options[q.correct].trim() ||
      Object.values(q.options).filter((v) => typeof v === "string" && v.trim())
        .length < 2
    )
      throw new Error(
        "Câu hỏi cần ít nhất hai lựa chọn và đáp án đúng có nội dung.",
      );
  }
  return value;
}
export function validateConfig(config: ExamConfig, count: number) {
  const protection = {
    monitorEnabled: config.monitorEnabled ?? true,
    maxAwaySeconds: config.maxAwaySeconds ?? 30,
    preventCopy: config.preventCopy ?? true,
  };
  if (
    typeof protection.monitorEnabled !== "boolean" ||
    typeof protection.preventCopy !== "boolean" ||
    !Number.isInteger(protection.maxAwaySeconds) ||
    protection.maxAwaySeconds < 5 ||
    protection.maxAwaySeconds > 300
  )
    throw new Error("Thời gian rời màn hình phải từ 5 đến 300 giây.");
  for (const [key, min, max] of [
    ["questionCount", 1, count],
    ["totalTimeMinutes", 1, 1440],
    ["passingScorePercent", 1, 100],
  ] as const) {
    if (
      !Number.isInteger(config[key]) ||
      config[key] < min ||
      config[key] > max
    )
      throw new Error(`Cấu hình ${key} không hợp lệ.`);
  }
  if (
    typeof config.title !== "string" ||
    !config.title.trim() ||
    typeof config.description !== "string"
  )
    throw new Error("Tiêu đề không hợp lệ.");
  for (const key of [
    "shuffleQuestions",
    "shuffleOptions",
    "allowReview",
    "isOpen",
  ] as const)
    if (typeof config[key] !== "boolean")
      throw new Error("Cấu hình không hợp lệ.");
  if (!Array.isArray(config.units) || !config.units.length)
    throw new Error("Cần ít nhất một đơn vị.");
  const names = new Set<string>();
  for (const unit of config.units) {
    if (
      typeof unit.name !== "string" ||
      !unit.name.trim() ||
      !Number.isSafeInteger(unit.targetCount) ||
      unit.targetCount < 0 ||
      names.has(unit.name.trim().toLowerCase())
    )
      throw new Error("Tên đơn vị hoặc quân số không hợp lệ.");
    names.add(unit.name.trim().toLowerCase());
  }
  return {
    ...protection,
    title: config.title.trim(),
    description: config.description,
    totalTimeMinutes: config.totalTimeMinutes,
    questionCount: config.questionCount,
    shuffleQuestions: config.shuffleQuestions,
    shuffleOptions: config.shuffleOptions,
    passingScorePercent: config.passingScorePercent,
    allowReview: config.allowReview,
    isOpen: config.isOpen,
    units: config.units.map((u) => ({
      name: u.name.trim(),
      targetCount: u.targetCount,
    })),
  };
}
function shuffle<T>(values: T[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function prepareQuestions(questions: Question[], config: ExamConfig) {
  return (config.shuffleQuestions ? shuffle(questions) : questions)
    .slice(0, config.questionCount)
    .map((q) => {
      if (!config.shuffleOptions) return q;
      const keys = ["A", "B", "C", "D"] as const;
      const order = shuffle([...keys]);
      return {
        ...q,
        options: Object.fromEntries(
          order.map((key, i) => [keys[i], q.options[key]]),
        ) as Question["options"],
        correct: keys[order.indexOf(q.correct as (typeof keys)[number])],
      };
    });
}
