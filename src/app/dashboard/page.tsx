"use client";

import React, { useState, useEffect, useCallback } from "react";
import { calculateCollectiveRanks } from "../../lib/storage";
import { api } from "../../lib/client";
import { exportResultsToExcel } from "../../lib/excel";
import { ExamConfig, ExamResult, CollectiveRank } from "../../types/quiz";
import {
  Trophy,
  Users,
  Award,
  TrendingUp,
  CheckCircle,
  Download,
  Search,
  Medal,
  Sparkles,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function DashboardPage() {
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [ranks, setRanks] = useState<CollectiveRank[]>([]);
  const [searchUnit, setSearchUnit] = useState("");
  const [activeTab, setActiveTab] = useState<"COLLECTIVE" | "INDIVIDUAL">(
    "COLLECTIVE",
  );
  const [error, setError] = useState("");
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null); // null = chưa biết

  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      // Ưu tiên lấy dữ liệu từ Cloud Database
      const data = await api("/api/results");
      const cfg = data.config;
      setConfig(cfg);
      setTotalAttempts(data.totalAttempts);
      setError("");
      if (data.success && Array.isArray(data.results)) {
        setResults(data.results as ExamResult[]);
        const rk = calculateCollectiveRanks(
          data.results as ExamResult[],
          cfg.units,
        );
        setRanks(rk);
        setDbConnected(true);
        setLastUpdated(new Date());
      } else {
        throw new Error("Dữ liệu trả về không hợp lệ");
      }
    } catch (err) {
      console.warn("Không kết nối được Cloud DB, dùng dữ liệu cục bộ:", err);
      setDbConnected(false);
      setError("Không tải được dữ liệu chung. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Tự động làm mới mỗi 30 giây để cập nhật kết quả mới nhất
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleExport = () => {
    if (!config) return;
    exportResultsToExcel(results, ranks, `Ket_Qua_${Date.now()}.xlsx`);
  };

  // Tính số liệu tổng quan toàn cơ quan
  const totalParticipants = results.length;
  const totalTarget =
    config?.units.reduce((acc, u) => acc + u.targetCount, 0) || 1;
  const overallParticipationRate = Math.min(
    100,
    Math.round((totalParticipants / totalTarget) * 10000) / 100,
  );
  const overallAvgScore =
    totalParticipants > 0
      ? Math.round(
          (results.reduce((acc, r) => acc + r.score, 0) / totalParticipants) *
            100,
        ) / 100
      : 0;
  const passedCount = results.filter((r) => r.isPassed).length;
  const overallPassRate =
    totalParticipants > 0
      ? Math.round((passedCount / totalParticipants) * 10000) / 100
      : 0;

  // Lọc bảng tập thể
  const filteredRanks = ranks.filter((r) =>
    r.unit.toLowerCase().includes(searchUnit.toLowerCase()),
  );

  // Sắp xếp top cá nhân
  const sortedIndividuals = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalDurationSeconds - b.totalDurationSeconds;
  });

  return (
    <div className="space-y-8 pb-12">
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Mỗi thí sinh tính lượt nộp cuối. Tổng lượt đã nộp: {totalAttempts}.
      </p>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/20 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Bảng Tổng Hợp Kết Quả &amp; Thi Đua
              </span>
              {/* Trạng thái kết nối Cloud DB */}
              {dbConnected === true && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  <Wifi className="w-3 h-3" />
                  Kết nối Cloud DB
                </span>
              )}
              {dbConnected === false && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                  <WifiOff className="w-3 h-3" />
                  Chưa kết nối database
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Bảng Xếp Hạng Tập Thể &amp; Cá Nhân
            </h1>
            <p className="text-blue-100 text-sm max-w-2xl">
              Đánh giá thực chất dựa trên 3 tiêu chí cốt lõi: Tỷ lệ quân số tham
              gia, Điểm trung bình và Tỷ lệ đạt xuất sắc (&ge;80%).
            </p>
            {lastUpdated && (
              <p className="text-blue-200 text-xs">
                Cập nhật lần cuối: {lastUpdated.toLocaleTimeString("vi-VN")} (Tự
                động làm mới mỗi 30 giây)
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>{isLoading ? "Đang tải..." : "Làm mới"}</span>
            </button>

            <button
              onClick={handleExport}
              disabled={results.length === 0}
              className="px-4 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-semibold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4 text-blue-700" />
              <span>Xuất Báo Cáo Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Thẻ KPI Tổng Thể */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">
              Số Người Tham Gia
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {totalParticipants}
            </p>
            <p className="text-xs text-slate-400">
              Trên tổng {totalTarget} quân số
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">
              Tỷ Lệ Tham Gia Chung
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">
              {overallParticipationRate}%
            </p>
            <p className="text-xs text-slate-400">Tiêu chí 1 thi đua</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">
              Điểm Trung Bình Toàn Khối
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">
              {overallAvgScore}
              <span className="text-sm font-normal text-slate-400">/10</span>
            </p>
            <p className="text-xs text-slate-400">Tiêu chí 2 thi đua</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">
              Tỷ Lệ Đạt
            </p>
            <p className="text-2xl font-bold text-purple-600 mt-0.5">
              {overallPassRate}%
            </p>
            <p className="text-xs text-slate-400">Tiêu chí 3 thi đua</p>
          </div>
        </div>
      </div>

      {/* Tabs Chuyển đổi Tập Thể / Cá Nhân */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("COLLECTIVE")}
          className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "COLLECTIVE"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Bảng Xếp Hạng Tập Thể (Đơn vị)</span>
        </button>

        <button
          onClick={() => setActiveTab("INDIVIDUAL")}
          className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "INDIVIDUAL"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Medal className="w-4 h-4" />
          <span>Bảng Vinh Danh Cá Nhân Xuất Sắc</span>
        </button>
      </div>

      {/* TAB 1: BẢNG XẾP HẠNG TẬP THỂ */}
      {activeTab === "COLLECTIVE" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Tìm đơn vị..."
                value={searchUnit}
                onChange={(e) => setSearchUnit(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="text-xs text-slate-500">
              * Điểm thi đua = (35% Tỷ lệ tham gia) + (35% Điểm TB x 10) + (30%
              Tỷ lệ đạt)
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold">
                  <tr>
                    <th className="py-4 px-4 text-center w-16">Hạng</th>
                    <th className="py-4 px-4">Tên Đơn Vị</th>
                    <th className="py-4 px-4 text-center">Quân Số</th>
                    <th className="py-4 px-4 text-center">Người Tham Gia</th>
                    <th className="py-4 px-4 text-center">Tỷ Lệ Tham Gia</th>
                    <th className="py-4 px-4 text-center">Điểm TB (/10)</th>
                    <th className="py-4 px-4 text-center">Tỷ Lệ Đạt</th>
                    <th className="py-4 px-4 text-center font-bold text-blue-700">
                      Điểm Thi Đua
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRanks.map((r) => {
                    let rankBadge = null;
                    if (r.rank === 1) {
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white font-bold shadow-sm">
                          1
                        </span>
                      );
                    } else if (r.rank === 2) {
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-bold shadow-sm">
                          2
                        </span>
                      );
                    } else if (r.rank === 3) {
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white font-bold shadow-sm">
                          3
                        </span>
                      );
                    } else {
                      rankBadge = (
                        <span className="text-slate-500 font-medium">
                          {r.rank}
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={r.unit}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-4 px-4 text-center">{rankBadge}</td>
                        <td className="py-4 px-4 font-semibold text-slate-800">
                          {r.unit}
                        </td>
                        <td className="py-4 px-4 text-center text-slate-600">
                          {r.targetCount}
                        </td>
                        <td className="py-4 px-4 text-center font-medium text-slate-700">
                          {r.participantCount}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              r.participationRate >= 100
                                ? "bg-emerald-100 text-emerald-700"
                                : r.participationRate >= 70
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {r.participationRate}%
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center font-bold text-slate-800">
                          {r.averageScore}
                        </td>
                        <td className="py-4 px-4 text-center font-semibold text-purple-700">
                          {r.passRate}%
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-base font-extrabold text-blue-600">
                            {r.overallScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BẢNG VINH DANH CÁ NHÂN */}
      {activeTab === "INDIVIDUAL" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Medal className="w-4 h-4 text-amber-500" />
              Danh sách kết quả cá nhân (Sắp xếp theo Điểm số & Thời gian)
            </h3>
            <span className="text-xs text-slate-500">
              Tổng cộng {sortedIndividuals.length} thí sinh
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4 text-center w-14">STT</th>
                  <th className="py-3.5 px-4">Họ và tên</th>
                  <th className="py-3.5 px-4">Cấp bậc</th>
                  <th className="py-3.5 px-4">Chức vụ</th>
                  <th className="py-3.5 px-4">Đơn vị</th>
                  <th className="py-3.5 px-4 text-center">Điểm số</th>
                  <th className="py-3.5 px-4 text-center">Số câu đúng</th>
                  <th className="py-3.5 px-4 text-center">Thời gian</th>
                  <th className="py-3.5 px-4 text-center">Đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedIndividuals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Chưa có kết quả dự thi nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  sortedIndividuals.map((res, idx) => (
                    <tr
                      key={res.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {res.userInfo.fullName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {res.userInfo.rank}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {res.userInfo.position}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {res.userInfo.unit}
                      </td>
                      <td className="py-3.5 px-4 text-center font-extrabold text-blue-600 text-base">
                        {res.score}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-700">
                        {res.correctCount}/{res.totalQuestions}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-500 font-mono text-xs">
                        {Math.floor(res.totalDurationSeconds / 60)}p{" "}
                        {res.totalDurationSeconds % 60}s
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            res.isPassed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {res.isPassed ? "Đạt" : "Chưa đạt"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
