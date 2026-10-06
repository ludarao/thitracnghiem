export interface Question {
  id: number;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correct: string;
}

export interface UnitTarget {
  name: string;
  targetCount: number; // Tổng quân số/biên chế của đơn vị
}

export interface ExamConfig {
  title: string;
  description: string;
  totalTimeMinutes: number; // Tổng thời gian thi cả bài (phút), 0 = không giới hạn
  timePerQuestionSeconds: number; // Giới hạn thời gian từng câu (giây), 0 = không giới hạn
  questionCount: number; // Số câu lấy ra để thi (ví dụ: 30 / 50)
  shuffleQuestions: boolean; // Đảo thứ tự câu hỏi
  shuffleOptions: boolean; // Đảo thứ tự A, B, C, D
  passingScorePercent: number; // Điểm đạt chuẩn % (mặc định 80%)
  allowReview: boolean; // Cho phép xem lại đáp án sau khi nộp
  isOpen: boolean; // Mở/khóa kỳ thi
  units: UnitTarget[]; // Danh sách đơn vị và quân số
}

export interface UserInfo {
  phone?: string;
  candidateCode?: string;
  fullName: string;
  rank: string; // Cấp bậc
  position: string; // Chức vụ
  unit: string; // Đơn vị
}

export interface AnswerLog {
  questionId: number;
  selectedOption: string; // A, B, C, D hoặc rỗng
  isCorrect: boolean;
  timeSpentSeconds: number; // Thời gian trả lời cho câu này
}

export interface ExamResult {
  id: string;
  userInfo: UserInfo;
  startTime: string;
  endTime: string;
  totalDurationSeconds: number; // Tổng thời gian làm bài
  score: number; // Điểm số (trên thang 10 hoặc 100)
  correctCount: number;
  totalQuestions: number;
  percentage: number; // % điểm
  isPassed: boolean; // >= passingScorePercent
  answers: AnswerLog[];
  submittedAt: string;
}

export interface CollectiveRank {
  unit: string;
  targetCount: number;
  participantCount: number;
  participationRate: number; // Tỷ lệ cán bộ, chiến sĩ tham gia (%)
  averageScore: number; // Điểm trung bình của người dự thi
  passedCount: number;
  passRate: number; // Tỷ lệ người đạt từ 80% số điểm trở lên (%)
  overallScore: number; // Điểm tổng hợp thi đua
  rank: number;
}
