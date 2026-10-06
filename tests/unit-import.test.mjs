import test from "node:test";
import assert from "node:assert/strict";
import { parseUnitRows } from "../src/lib/unit-import.ts";
import { validateConfig } from "../src/lib/quiz-rules.ts";
import { DEFAULT_CONFIG } from "../src/lib/storage.ts";

test("imports optional counts, whitespace and blank rows", () => {
  assert.deepEqual(parseUnitRows([["Tên đơn vị", "Số lượng"], ["  Chi đoàn   1 ", 30], [], ["Chi đoàn 2", ""], ["Chi đoàn 3", "0"]]), [
    { name: "Chi đoàn 1", targetCount: 30 },
    { name: "Chi đoàn 2", targetCount: 0 },
    { name: "Chi đoàn 3", targetCount: 0 },
  ]);
  assert.deepEqual(parseUnitRows([["Tên đơn vị"], ["Đơn vị"]]), [{ name: "Đơn vị", targetCount: 0 }]);
});
test("recognizes headers with different case, accents and order", () => {
  assert.deepEqual(parseUnitRows([[], [" SO LUONG ", "TEN DON VI"], ["12", "A"]]), [{ name: "A", targetCount: 12 }]);
});
test("rejects duplicate units and reports Excel row", () => {
  assert.throws(() => parseUnitRows([["Tên đơn vị"], ["Đơn vị A"], ["đơn vị a"]]), /Dòng 3.*trùng/);
});
test("rejects invalid counts and missing names without partial results", () => {
  for (const count of [-1, 1.5, "abc", true, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseUnitRows([["Tên đơn vị", "Số lượng"], ["A", 10], ["B", count]]), /Dòng 3.*số lượng/);
  }
  assert.throws(() => parseUnitRows([["Tên đơn vị", "Số lượng"], ["", 12]]), /Dòng 2.*thiếu/);
});
test("rejects empty lists and missing headers", () => {
  for (const rows of [[], [["Tên đơn vị"]], [["Tên đơn vị"], []]]) assert.throws(() => parseUnitRows(rows), /không có dữ liệu/);
  assert.throws(() => parseUnitRows([["Tên khác"], ["A"]]), /tiêu đề/);
});
test("server accepts unspecified unit count and rejects negative counts", () => {
  const config = { ...DEFAULT_CONFIG, questionCount: 1, units: [{ name: "A", targetCount: 0 }] };
  assert.equal(validateConfig(config, 1).units[0].targetCount, 0);
  assert.throws(() => validateConfig({ ...config, units: [{ name: "A", targetCount: -1 }] }, 1));
});
