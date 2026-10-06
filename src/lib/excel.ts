import * as XLSX from 'xlsx';
import { Question } from '../types/quiz';

/**
 * Đọc file Excel cấu trúc 7 cột: TT, Question, A, B, C, D, Correct
 */
export async function parseExcelQuestions(file: File): Promise<Question[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Chuyển sang dạng mảng các dòng
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length < 2) {
    throw new Error('File Excel rỗng hoặc không có dữ liệu câu hỏi.');
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
    if (!questionText || String(questionText).trim() === '') continue;

    const correctUpper = String(correctVal || '').trim().toUpperCase();

    questions.push({
      id: Number(stt) || questions.length + 1,
      question: String(questionText).trim(),
      options: {
        A: String(optA || '').trim(),
        B: String(optB || '').trim(),
        C: String(optC || '').trim(),
        D: String(optD || '').trim(),
      },
      correct: correctUpper,
    });
  }

  if (questions.length === 0) {
    throw new Error('Không trích xuất được câu hỏi nào từ file Excel. Vui lòng kiểm tra định dạng các cột: TT, Question, A, B, C, D, Correct.');
  }

  return questions;
}

/**
 * Xuất dữ liệu kết quả thi ra file Excel
 */
export function exportResultsToExcel(results: any[], collectiveRanks: any[], filename = 'Ket_Qua_Hoi_Thi.xlsx') {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Xếp hạng tập thể
  const rankSheetData = collectiveRanks.map(r => ({
    'Thứ hạng': r.rank,
    'Đơn vị': r.unit,
    'Quân số đăng ký': r.targetCount,
    'Số lượt thi': r.participantCount,
    'Tỷ lệ tham gia (%)': `${r.participationRate}%`,
    'Điểm trung bình': r.averageScore,
    'Số người đạt >=80%': r.passedCount,
    'Tỷ lệ đạt >=80% (%)': `${r.passRate}%`,
    'Điểm thi đua tổng hợp': r.overallScore,
  }));
  const wsRanks = XLSX.utils.json_to_sheet(rankSheetData);
  XLSX.utils.book_append_sheet(wb, wsRanks, 'Xep_Hang_Tap_The');

  // Sheet 2: Danh sách cá nhân
  const personalData = results.map((res, idx) => ({
    'STT': idx + 1,
    'Họ và tên': res.userInfo.fullName,
    'Cấp bậc': res.userInfo.rank,
    'Chức vụ': res.userInfo.position,
    'Đơn vị': res.userInfo.unit,
    'Điểm số (/10)': res.score,
    'Số câu đúng': `${res.correctCount}/${res.totalQuestions}`,
    'Tỷ lệ (%)': `${res.percentage}%`,
    'Kết quả': res.isPassed ? 'Đạt' : 'Chưa đạt',
    'Thời gian làm bài (giây)': res.totalDurationSeconds,
    'Thời điểm nộp bài': new Date(res.submittedAt).toLocaleString('vi-VN'),
  }));
  const wsPersonal = XLSX.utils.json_to_sheet(personalData);
  XLSX.utils.book_append_sheet(wb, wsPersonal, 'Chi_Tiet_Ca_Nhan');

  XLSX.writeFile(wb, filename);
}
