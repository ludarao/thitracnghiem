import * as XLSX from "xlsx";
import type { Question } from "../types/quiz";

import { parseUnitRows } from "./unit-import";

export async function parseExcelUnits(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error("File Excel tối đa 5 MB.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("File không có trang dữ liệu.");
  return parseUnitRows(
    XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }),
  );
}

export function downloadUnitTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Tên đơn vị", "Số lượng"],
    ["Chi đoàn Đại đội 1", 45],
    ["Chi đoàn Đại đội 2", ""],
  ]);
  sheet["!cols"] = [{ wch: 40 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Danh sách đơn vị");
  XLSX.writeFile(workbook, "mau-danh-sach-don-vi.xlsx");
}

/**
 * Đọc file Excel cấu trúc 7 cột: TT, Question, A, B, C, D, Correct
 */
export async function parseExcelQuestions(file: File): Promise<Question[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Chuyển sang dạng mảng các dòng
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  });
  if (rows.length < 2) {
    throw new Error("File Excel rỗng hoặc không có dữ liệu câu hỏi.");
  }

  const questions: Question[] = [];

  // Bắt đầu đọc từ dòng thứ 2 (bỏ qua dòng tiêu đề Header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const stt = row[0];
    const questionText = row[1];
    const optA = row[2];
    const optB = row[3];
    const optC = row[4];
    const optD = row[5];
    const correctVal = row[6];

    // Bỏ qua dòng trống nếu không có nội dung câu hỏi hoặc đáp án
    if (!questionText || String(questionText).trim() === "") continue;

    const correctUpper = String(correctVal || "")
      .trim()
      .toUpperCase();

    questions.push({
      id: Number(stt) || questions.length + 1,
      question: String(questionText).trim(),
      options: {
        A: String(optA || "").trim(),
        B: String(optB || "").trim(),
        C: String(optC || "").trim(),
        D: String(optD || "").trim(),
      },
      correct: correctUpper,
    });
  }

  if (questions.length === 0) {
    throw new Error(
      "Không trích xuất được câu hỏi nào từ file Excel. Vui lòng kiểm tra định dạng các cột: TT, Question, A, B, C, D, Correct.",
    );
  }

  const ids = new Set<number>();
  for (const q of questions) {
    if (ids.has(q.id) || !Number.isInteger(q.id) || q.id < 1)
      throw new Error("ID câu hỏi bị trùng hoặc không hợp lệ.");
    ids.add(q.id);
    if (
      !["A", "B", "C", "D"].includes(q.correct) ||
      !q.options[q.correct as keyof typeof q.options]
    )
      throw new Error("Đáp án đúng không hợp lệ tại câu " + q.id);
  }
  return questions;
}

/**
 * Xuất dữ liệu kết quả thi ra file Excel
 */
export function exportResultsToExcel(
  results: any[],
  collectiveRanks: any[],
  filename = "Ket_Qua_Hoi_Thi.xlsx",
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Xếp hạng tập thể
  const rankSheetData = collectiveRanks.map((r) => ({
    "Thứ hạng": r.rank,
    "Đơn vị": r.unit,
    "Quân số đăng ký": r.targetCount,
    "Số người tham gia": r.participantCount,
    "Tỷ lệ tham gia (%)": `${r.participationRate}%`,
    "Điểm trung bình": r.averageScore,
    "Số người đạt": r.passedCount,
    "Tỷ lệ đạt (%)": `${r.passRate}%`,
    "Điểm thi đua tổng hợp": r.overallScore,
  }));
  const wsRanks = XLSX.utils.json_to_sheet(rankSheetData);
  XLSX.utils.book_append_sheet(wb, wsRanks, "Xep_Hang_Tap_The");

  // Sheet 2: Danh sách cá nhân
  const personalData = results.map((res, idx) => ({
    STT: idx + 1,
    "Họ và tên": res.userInfo.fullName,
    ...(res.userInfo.candidateCode
      ? {
          "Mã thí sinh": res.userInfo.candidateCode,
          "Số điện thoại": res.userInfo.phone,
        }
      : {}),
    "Cấp bậc": res.userInfo.rank,
    "Chức vụ": res.userInfo.position,
    "Đơn vị": res.userInfo.unit,
    "Điểm số (/10)": res.score,
    "Số câu đúng": `${res.correctCount}/${res.totalQuestions}`,
    "Tỷ lệ (%)": `${res.percentage}%`,
    "Kết quả": res.isPassed ? "Đạt" : "Chưa đạt",
    "Thời gian làm bài (giây)": res.totalDurationSeconds,
    ...(res.examId ? { "Kỳ thi": res.examId } : {}),
    "Thời điểm nộp bài": new Date(res.submittedAt).toLocaleString("vi-VN"),
  }));
  const wsPersonal = XLSX.utils.json_to_sheet(personalData);
  XLSX.utils.book_append_sheet(wb, wsPersonal, "Chi_Tiet_Ca_Nhan");

  XLSX.writeFile(wb, filename);
}
