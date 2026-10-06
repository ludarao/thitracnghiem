'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  getStorageConfig, 
  getStorageQuestions, 
  saveExamResult 
} from '../lib/storage';
import { ExamConfig, Question, UserInfo, ExamResult, AnswerLog } from '../types/quiz';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  ShieldCheck, 
  Briefcase, 
  Building2, 
  ChevronRight, 
  ChevronLeft, 
  Send, 
  Trophy, 
  RefreshCcw,
  BarChart,
  HelpCircle,
  Timer
} from 'lucide-react';
import Link from 'next/link';

export default function ExamPage() {
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examState, setExamState] = useState<'REGISTER' | 'IN_PROGRESS' | 'FINISHED'>('REGISTER');

  // Form thông tin thí sinh
  const [userInfo, setUserInfo] = useState<UserInfo>({
    fullName: '',
    rank: 'Đoàn viên',
    position: 'Cán bộ',
    unit: '',
  });

  // Bài thi thực tế
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({}); // { questionId: 'A' }
  const [timeRemainingTotal, setTimeRemainingTotal] = useState<number>(0);
  const [timeSpentPerQuestion, setTimeSpentPerQuestion] = useState<Record<number, number>>({});
  const [questionTimer, setQuestionTimer] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>('');

  // Kết quả sau khi nộp
  const [result, setResult] = useState<ExamResult | null>(null);

  useEffect(() => {
    const loadedConfig = getStorageConfig();
    const loadedQuestions = getStorageQuestions();
    setConfig(loadedConfig);
    setQuestions(loadedQuestions);
    if (loadedConfig.units.length > 0 && !userInfo.unit) {
      setUserInfo(prev => ({ ...prev, unit: loadedConfig.units[0].name }));
    }
  }, []);

  // Timer tổng
  useEffect(() => {
    if (examState !== 'IN_PROGRESS') return;
    if (timeRemainingTotal <= 0 && config?.totalTimeMinutes && config.totalTimeMinutes > 0) {
      handleSubmitExam();
      return;
    }

    const interval = setInterval(() => {
      setTimeRemainingTotal(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });

      // Tăng thời gian đã tiêu tốn cho câu hiện tại
      const currQ = examQuestions[currentIndex];
      if (currQ) {
        setTimeSpentPerQuestion(prev => ({
          ...prev,
          [currQ.id]: (prev[currQ.id] || 0) + 1,
        }));
      }

      // Nếu có bật giới hạn thời gian từng câu
      if (config?.timePerQuestionSeconds && config.timePerQuestionSeconds > 0) {
        setQuestionTimer(prev => {
          if (prev <= 1) {
            // Hết giờ câu hiện tại -> tự nhảy sang câu tiếp theo
            if (currentIndex < examQuestions.length - 1) {
              setCurrentIndex(c => c + 1);
              return config.timePerQuestionSeconds;
            }
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [examState, timeRemainingTotal, currentIndex, examQuestions, config]);

  // Bắt đầu làm bài thi
  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInfo.fullName.trim() || !userInfo.unit) {
      alert('Vui lòng điền đầy đủ Họ và tên và Đơn vị!');
      return;
    }
    if (!config?.isOpen) {
      alert('Hiện tại hệ thống thi đang tạm đóng bởi Quản trị viên!');
      return;
    }

    // Xử lý rút trích câu hỏi và xáo trộn
    let pool = [...questions];
    if (config.shuffleQuestions) {
      pool = pool.sort(() => Math.random() - 0.5);
    }
    const countToPick = Math.min(config.questionCount || 30, pool.length);
    const selected = pool.slice(0, countToPick);

    // Xáo trộn đáp án nếu bật
    const preparedQuestions = selected.map(q => {
      if (!config.shuffleOptions) return q;
      // Trộn thứ tự các lựa chọn
      const optEntries = Object.entries(q.options) as [string, string][];
      const correctText = q.options[q.correct as keyof typeof q.options];
      const shuffled = [...optEntries].sort(() => Math.random() - 0.5);
      
      const newOptions: any = {};
      let newCorrect = 'A';
      const keys = ['A', 'B', 'C', 'D'];
      shuffled.forEach((item, idx) => {
        const k = keys[idx];
        newOptions[k] = item[1];
        if (item[1] === correctText) {
          newCorrect = k;
        }
      });

      return {
        ...q,
        options: newOptions,
        correct: newCorrect,
      };
    });

    setExamQuestions(preparedQuestions);
    setExamState('IN_PROGRESS');
    setStartTime(new Date().toISOString());
    setTimeRemainingTotal((config.totalTimeMinutes || 20) * 60);
    setQuestionTimer(config.timePerQuestionSeconds || 0);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setTimeSpentPerQuestion({});
  };

  const handleSelectOption = (optionKey: string) => {
    const currentQ = examQuestions[currentIndex];
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQ.id]: optionKey,
    }));
  };

  const handleSubmitExam = () => {
    if (examState === 'FINISHED') return;
    const now = new Date();
    const endIso = now.toISOString();

    let correctCount = 0;
    const answerLogs: AnswerLog[] = examQuestions.map(q => {
      const selected = selectedAnswers[q.id] || '';
      const isCorrect = selected === q.correct;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        selectedOption: selected,
        isCorrect,
        timeSpentSeconds: timeSpentPerQuestion[q.id] || 0,
      };
    });

    const totalQuestions = examQuestions.length;
    const score = Math.round((correctCount / (totalQuestions || 1)) * 10 * 10) / 10; // Thang 10
    const percentage = Math.round((correctCount / (totalQuestions || 1)) * 100);
    const passThreshold = config?.passingScorePercent ?? 80;
    const isPassed = percentage >= passThreshold;

    const startMs = new Date(startTime).getTime();
    const totalDurationSeconds = Math.round((now.getTime() - startMs) / 1000);

    const examResultData: ExamResult = {
      id: 'res_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userInfo,
      startTime,
      endTime: endIso,
      totalDurationSeconds,
      score,
      correctCount,
      totalQuestions,
      percentage,
      isPassed,
      answers: answerLogs,
      submittedAt: endIso,
    };

    // Luôn lưu local trước để thí sinh có thể xem kết quả ngay, kể cả khi mạng chậm
    saveExamResult(examResultData);
    setResult(examResultData);
    setExamState('FINISHED');

    // Đồng thời POST lên Cloud Database (Vercel Postgres) để gom kết quả về Dashboard chung
    // Dùng fire-and-forget: không block UI, thất bại sẽ log ra console
    fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(examResultData),
    }).catch((err) => {
      console.warn('Không thể đồng bộ kết quả lên Cloud DB (Bài thi đã lưu trên máy):', err);
    });
  };

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Giao diện Đăng ký / Điền thông tin
  if (examState === 'REGISTER') {
    return (
      <div className="max-w-2xl mx-auto py-6 sm:py-10">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-6 sm:p-8 text-white text-center relative overflow-hidden">
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/20 backdrop-blur-sm mb-3">
                Cổng Thi Trực Tuyến
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                {config.title}
              </h1>
              <p className="text-blue-100 text-sm max-w-xl mx-auto">
                {config.description}
              </p>
            </div>
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="p-6 sm:p-8">
            {!config.isOpen && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Thông báo:</strong> Cổng thi hiện đang tạm khóa hoặc chưa mở. Vui lòng liên hệ Quản trị viên để được mở quyền thi.
                </div>
              </div>
            )}

            {/* Thông số đề thi */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
              <div>
                <p className="text-xs text-slate-500 font-medium">Số câu thi</p>
                <p className="text-base font-bold text-slate-800">{config.questionCount} câu</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Thời gian tổng</p>
                <p className="text-base font-bold text-slate-800">{config.totalTimeMinutes} phút</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Giới hạn mỗi câu</p>
                <p className="text-base font-bold text-slate-800">
                  {config.timePerQuestionSeconds > 0 ? `${config.timePerQuestionSeconds}s` : 'Tự do'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Ngưỡng đạt</p>
                <p className="text-base font-bold text-emerald-600">{config.passingScorePercent}%</p>
              </div>
            </div>

            <form onSubmit={handleStartExam} className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900 border-b pb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Thông tin người dự thi (Bắt buộc)
              </h3>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  1. Họ và tên <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn An"
                    value={userInfo.fullName}
                    onChange={(e) => setUserInfo({ ...userInfo, fullName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    2. Cấp bậc <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Binh nhất, Hạ sĩ, Thiếu úy..."
                      value={userInfo.rank}
                      onChange={(e) => setUserInfo({ ...userInfo, rank: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    3. Chức vụ <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Đoàn viên, Bí thư chi đoàn..."
                      value={userInfo.position}
                      onChange={(e) => setUserInfo({ ...userInfo, position: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  4. Đơn vị <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <select
                    required
                    value={userInfo.unit}
                    onChange={(e) => setUserInfo({ ...userInfo, unit: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    {config.units.map((u) => (
                      <option key={u.name} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  * Kết quả thi của bạn sẽ được tính trực tiếp vào bảng xếp hạng thi đua của Đơn vị này.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={!config.isOpen}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-base shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  <span>Bắt Đầu Làm Bài Thi</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Giao diện Làm bài thi
  if (examState === 'IN_PROGRESS') {
    const currentQuestion = examQuestions[currentIndex];
    const totalQ = examQuestions.length;
    const answeredCount = Object.keys(selectedAnswers).length;
    const progressPercent = Math.round((answeredCount / totalQ) * 100);

    return (
      <div className="max-w-4xl mx-auto py-2 sm:py-6 space-y-4">
        {/* Thanh trạng thái Header bài thi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-18 z-40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                {currentIndex + 1}/{totalQ}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{userInfo.fullName}</p>
                <p className="text-xs text-slate-500">{userInfo.unit} • {userInfo.rank}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Giới hạn thời gian từng câu nếu có */}
              {config.timePerQuestionSeconds > 0 && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  questionTimer <= 10 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-amber-50 text-amber-700'
                }`}>
                  <Timer className="w-4 h-4" />
                  <span>Câu: {questionTimer}s</span>
                </div>
              )}

              {/* Tổng thời gian */}
              <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold shadow-sm ${
                timeRemainingTotal <= 180 ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-900 text-white'
              }`}>
                <Clock className="w-4 h-4" />
                <span>{formatTime(timeRemainingTotal)}</span>
              </div>

              {/* Nút nộp bài */}
              <button
                onClick={() => {
                  if (confirm(`Bạn đã trả lời ${answeredCount}/${totalQ} câu hỏi. Bạn có chắc chắn muốn nộp bài ngay bây giờ?`)) {
                    handleSubmitExam();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>Nộp Bài</span>
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Nội dung câu hỏi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
              Câu hỏi {currentIndex + 1}
            </span>
            <h2 className="text-lg sm:text-xl font-medium text-slate-900 mt-3 leading-relaxed">
              {currentQuestion.question}
            </h2>
          </div>

          {/* Các lựa chọn A, B, C, D */}
          <div className="space-y-3">
            {(['A', 'B', 'C', 'D'] as const).map((key) => {
              const optionText = currentQuestion.options[key];
              if (!optionText) return null;
              const isSelected = selectedAnswers[currentQuestion.id] === key;

              return (
                <button
                  key={key}
                  onClick={() => handleSelectOption(key)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {key}
                  </div>
                  <span className="text-sm sm:text-base leading-snug pt-0.5">{optionText}</span>
                </button>
              );
            })}
          </div>

          {/* Điều hướng Next / Prev */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            <span className="text-xs text-slate-400">
              Đã làm {answeredCount}/{totalQ} câu
            </span>

            <button
              onClick={() => setCurrentIndex(prev => Math.min(totalQ - 1, prev + 1))}
              disabled={currentIndex === totalQ - 1}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <span>Câu sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bảng danh sách câu hỏi để nhảy nhanh */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" />
            Danh sách câu hỏi bài thi
          </h4>
          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 gap-2">
            {examQuestions.map((q, idx) => {
              const isAnswered = Boolean(selectedAnswers[q.id]);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentIndex(idx);
                    if (config.timePerQuestionSeconds > 0) {
                      setQuestionTimer(config.timePerQuestionSeconds);
                    }
                  }}
                  className={`h-9 rounded-lg text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2'
                      : isAnswered
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Giao diện Kết quả sau khi nộp
  if (examState === 'FINISHED' && result) {
    return (
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden text-center p-8">
          <div className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-4 ${
            result.isPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}>
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {result.isPassed ? 'CHÚC MỪNG BẠN ĐÃ HOÀN THÀNH XUẤT SẮC!' : 'BẠN ĐÃ HOÀN THÀNH BÀI THI'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Thí sinh: <span className="font-semibold text-slate-700">{result.userInfo.fullName}</span> ({result.userInfo.rank} - {result.userInfo.unit})
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Điểm số</p>
              <p className="text-3xl font-extrabold text-blue-600">{result.score}<span className="text-sm text-slate-400">/10</span></p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Số câu đúng</p>
              <p className="text-3xl font-extrabold text-slate-800">{result.correctCount}<span className="text-sm text-slate-400">/{result.totalQuestions}</span></p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tỷ lệ chính xác</p>
              <p className="text-3xl font-extrabold text-emerald-600">{result.percentage}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Thời gian làm</p>
              <p className="text-2xl font-bold text-slate-700 pt-1">{formatTime(result.totalDurationSeconds)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <BarChart className="w-4 h-4" />
              <span>Xem Bảng Xếp Hạng Tập Thể</span>
            </Link>

            <button
              onClick={() => {
                setExamState('REGISTER');
                setResult(null);
              }}
              className="px-6 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-all flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              <span>Làm Lượt Khác</span>
            </button>
          </div>
        </div>

        {/* Xem lại đáp án nếu config cho phép */}
        {config.allowReview && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Xem lại chi tiết đáp án bài thi
            </h3>

            <div className="space-y-6">
              {examQuestions.map((q, idx) => {
                const userAns = selectedAnswers[q.id];
                const isCorrect = userAns === q.correct;

                return (
                  <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Câu {idx + 1}: {q.question}
                      </p>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                        isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {isCorrect ? 'Đúng' : 'Sai'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {(['A', 'B', 'C', 'D'] as const).map((k) => {
                        const opt = q.options[k];
                        if (!opt) return null;
                        const isChosen = userAns === k;
                        const isRightAnswer = q.correct === k;

                        let style = 'bg-white border-slate-200 text-slate-700';
                        if (isRightAnswer) {
                          style = 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium ring-1 ring-emerald-400';
                        } else if (isChosen && !isRightAnswer) {
                          style = 'bg-red-50 border-red-300 text-red-800 line-through';
                        }

                        return (
                          <div key={k} className={`p-2.5 rounded-lg border flex items-center gap-2 ${style}`}>
                            <span className="font-bold">{k}.</span>
                            <span>{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
