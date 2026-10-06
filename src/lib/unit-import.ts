import type { UnitTarget } from "../types/quiz";

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function parseUnitRows(rows: unknown[][]): UnitTarget[] {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim()),
  );
  if (headerIndex < 0) throw new Error("File Excel không có dữ liệu đơn vị.");
  const headers = rows[headerIndex].map(normalizeHeader);
  const nameIndex = headers.findIndex((header) =>
    ["ten don vi", "don vi"].includes(header),
  );
  const countIndex = headers.findIndex((header) =>
    ["so luong", "tong quan so", "quan so"].includes(header),
  );
  if (nameIndex < 0)
    throw new Error(
      'Dòng tiêu đề phải có cột "Tên đơn vị"; cột "Số lượng" không bắt buộc.',
    );
  const units: UnitTarget[] = [];
  const names = new Set<string>();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => String(cell ?? "").trim() === "")) continue;
    const name = String(row[nameIndex] ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name) throw new Error(`Dòng ${i + 1}: thiếu tên đơn vị.`);
    const key = name.normalize("NFC").toLowerCase();
    if (names.has(key))
      throw new Error(`Dòng ${i + 1}: tên đơn vị "${name}" bị trùng.`);
    const rawCount = countIndex < 0 ? "" : row[countIndex];
    const text = String(rawCount ?? "").trim();
    const targetCount = text === "" ? 0 : Number(text);
    if (
      typeof rawCount === "boolean" ||
      !Number.isSafeInteger(targetCount) ||
      targetCount < 0
    )
      throw new Error(
        `Dòng ${i + 1}: số lượng phải là số nguyên từ 0 trở lên hoặc bỏ trống.`,
      );
    names.add(key);
    units.push({ name, targetCount });
  }
  if (!units.length) throw new Error("File Excel không có dữ liệu đơn vị.");
  return units;
}
