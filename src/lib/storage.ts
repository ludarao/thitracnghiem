import type { ExamConfig, ExamResult, CollectiveRank } from "../types/quiz";

export const DEFAULT_CONFIG: ExamConfig = {
  title: "HỘI THI TÌM HIỂU NGHỊ QUYẾT ĐẠI HỘI XIII ĐOÀN TNCS HỒ CHÍ MINH",
  description:
    "Kiểm tra, đánh giá nhận thức cán bộ, đoàn viên thanh niên về Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII",
  totalTimeMinutes: 20, // 20 phút tổng bài thi
  timePerQuestionSeconds: 0, // 0 = không giới hạn thời gian từng câu (hoặc ví dụ 45s nếu bật)
  questionCount: 30, // Lấy 30 câu ngẫu nhiên từ ngân hàng
  shuffleQuestions: true, // Đảo thứ tự câu hỏi
  shuffleOptions: true, // Đảo thứ tự đáp án A, B, C, D
  passingScorePercent: 80, // Tiêu chuẩn đạt 80% (tính cho chỉ số tập thể)
  allowReview: true,
  isOpen: true,
  units: [
    { name: "Chi đoàn Tham mưu", targetCount: 25 },
    { name: "Chi đoàn Chính trị", targetCount: 20 },
    { name: "Chi đoàn Hậu cần - Kỹ thuật", targetCount: 30 },
    { name: "Chi đoàn Đại đội 1", targetCount: 45 },
    { name: "Chi đoàn Đại đội 2", targetCount: 45 },
    { name: "Chi đoàn Đại đội 3", targetCount: 40 },
    { name: "Đoàn cơ sở Khối nghiệp vụ", targetCount: 50 },
  ],
};

// Hàm tính toán xếp hạng tập thể theo 3 tiêu chí của người dùng:
// 1. Tỷ lệ cán bộ, chiến sĩ tham gia (%)
// 2. Điểm trung bình của người dự thi (thang điểm 10)
// 3. Tỷ lệ người đạt từ 80% số điểm trở lên (%)
export function calculateCollectiveRanks(
  results: ExamResult[],
  units: ExamConfig["units"],
): CollectiveRank[] {
  const ranks: CollectiveRank[] = units.map((unit) => {
    const unitResults = results.filter(
      (r) =>
        r.userInfo.unit.trim().toLowerCase() === unit.name.trim().toLowerCase(),
    );
    const participantCount = unitResults.length;
    const targetCount =
      unit.targetCount > 0 ? unit.targetCount : Math.max(participantCount, 1);

    // 1. Tỷ lệ tham gia
    const participationRate = Math.min(
      100,
      Math.round((participantCount / targetCount) * 10000) / 100,
    );

    // 2. Điểm trung bình
    const totalScore = unitResults.reduce((acc, curr) => acc + curr.score, 0);
    const averageScore =
      participantCount > 0
        ? Math.round((totalScore / participantCount) * 100) / 100
        : 0;

    // 3. Tỷ lệ đạt từ 80% trở lên
    const passedCount = unitResults.filter((r) => r.isPassed).length;
    const passRate =
      participantCount > 0
        ? Math.round((passedCount / participantCount) * 10000) / 100
        : 0;

    // Điểm tổng hợp: tham gia 35%, điểm trung bình 35%, tỷ lệ đạt 30%.
    // averageScore trên thang 10 -> nhân 10 để ra thang 100
    const overallScore =
      Math.round(
        (participationRate * 0.35 + averageScore * 10 * 0.35 + passRate * 0.3) *
          100,
      ) / 100;

    return {
      unit: unit.name,
      targetCount,
      participantCount,
      participationRate,
      averageScore,
      passedCount,
      passRate,
      overallScore,
      rank: 0,
    };
  });

  // Sắp xếp thứ tự: Điểm thi đua cao nhất xếp trước
  ranks.sort((a, b) => {
    if (b.overallScore !== a.overallScore)
      return b.overallScore - a.overallScore;
    if (b.averageScore !== a.averageScore)
      return b.averageScore - a.averageScore;
    return b.participationRate - a.participationRate;
  });

  // Gán thứ hạng
  ranks.forEach((item, index) => {
    item.rank = index + 1;
  });

  return ranks;
}
