"use client";

import Verification from "../../components/Verification";
import React, { useState, useEffect, useRef } from "react";
import { api } from "../../lib/client";
import { collectSubmittedHistory } from "../../lib/history-export";
import {
  exportResultsToExcel,
  parseExcelQuestions,
  parseExcelUnits,
  downloadUnitTemplate,
} from "../../lib/excel";
import { ExamConfig, Question, UnitTarget } from "../../types/quiz";
import {
  Lock,
  Save,
  Upload,
  Trash2,
  Plus,
  Key,
  Shuffle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ListOrdered,
  LogOut,
  Layers,
} from "lucide-react";

export default function AdminPage() {
  const [security, setSecurity] = useState({ enabled: false, siteKey: "" });
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationReset, setVerificationReset] = useState(0);
  const [loginBusy, setLoginBusy] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyCursor, setHistoryCursor] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelMessage, setExcelMessage] = useState("");
  const excelPending = useRef(false);
  const exportAllSubmittedExcel = async () => {
    if (excelPending.current) return;
    excelPending.current = true;
    setExcelBusy(true);
    setExcelMessage("Đang tải toàn bộ lượt nộp bài...");
    try {
      const rows = await collectSubmittedHistory<any>(api, (count) =>
        setExcelMessage(`Đã tải ${count} lượt nộp bài...`),
      );
      exportResultsToExcel(rows, [], "Lich_Su_Thi_Toan_Bo.xlsx");
      setExcelMessage(
        `Đã xuất ${rows.length} lượt nộp bài ở tất cả các kỳ thi.`,
      );
    } catch (e) {
      setExcelMessage("Xuất Excel thất bại: " + (e as Error).message);
    } finally {
      excelPending.current = false;
      setExcelBusy(false);
    }
  };
  const loadHistory = async (cursor = "", pages = [""]) => {
    setHistoryBusy(true);
    try {
      const data = await api(
        "/api/results?history=1&cursor=" + encodeURIComponent(cursor),
      );
      setHistory(data.history);
      setHistoryCursor(pages);
      setNextCursor(data.nextCursor);
      setHistoryError("");
    } catch (e) {
      setHistoryError((e as Error).message);
    } finally {
      setHistoryBusy(false);
    }
  };

  const [dataBusy, setDataBusy] = useState(false);
  const [dataMessage, setDataMessage] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const exportAllExamData = async () => {
    setDataBusy(true);
    setDataMessage("Đang xuất toàn bộ dữ liệu...");
    try {
      const backup: Record<string, any> = {
        format: "quiz-exam-backup-v1",
        exportedAt: new Date().toISOString(),
      };
      let examId = "";
      for (const kind of ["attempts", "legacy", "candidates", "banks"]) {
        backup[kind] = [];
        let cursor = "";
        do {
          const params = new URLSearchParams({ kind, cursor, examId });
          const page = await api("/api/admin/exam-data?" + params);
          examId = page.examId;
          if (page.settings) backup.settings = page.settings;
          backup[kind].push(...page.records);
          cursor = page.nextCursor || "";
          setDataMessage(
            `Đang xuất ${kind}: ${backup[kind].length} bản ghi...`,
          );
        } while (cursor);
      }
      // Check that a purge or period reset did not happen during the last page.
      await api(
        "/api/admin/exam-data?" +
          new URLSearchParams({ kind: "attempts", examId }),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `Du_Lieu_Thi_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDataMessage(
        `Đã tạo file xuất: ${backup.attempts.length} lượt thi và ${backup.legacy.length} kết quả cũ. Kiểm tra file tải về trước khi xóa.`,
      );
    } catch (e) {
      setDataMessage("Xuất thất bại: " + (e as Error).message);
    } finally {
      setDataBusy(false);
    }
  };
  const deleteAllExamData = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataBusy(true);
    setDeleteError("");
    try {
      const data = await api("/api/admin/exam-data", {
        method: "DELETE",
        body: JSON.stringify({
          password: deletePassword,
          confirmation: "DELETE_ALL_EXAM_DATA",
        }),
      });
      setShowDelete(false);
      setDeletePassword("");
      setConfig((previous) =>
        previous ? { ...previous, isOpen: false } : previous,
      );
      setDataMessage(
        `Đã xóa ${data.deleted.attempts} lượt thi và ${data.deleted.legacy} kết quả cũ. Kỳ thi đã đóng; bật Mở kỳ thi và lưu cấu hình khi muốn tổ chức thi tiếp.`,
      );
      await loadHistory();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDataBusy(false);
    }
  };

  // Cấu hình
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitTarget, setNewUnitTarget] = useState<number>(0);

  const [unitsImportStatus, setUnitsImportStatus] = useState("");
  const [unitsImportBusy, setUnitsImportBusy] = useState(false);

  // Mật khẩu mới
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  // Tải file excel
  const [uploadStatus, setUploadStatus] = useState<string>("");

  useEffect(() => {
    void api("/api/admin")
      .then((data) => {
        if (data.security) setSecurity(data.security);
        if (data.authenticated) {
          setIsAuthenticated(true);
          void loadAdminData();
        }
      })
      .catch((e) => setLoginError(e.message));
  }, []);
  const loadAdminData = async () => {
    try {
      const data = await api("/api/config");
      setConfig(data.config);
      setQuestions(data.questions || []);
      void loadHistory();
    } catch (e) {
      setLoginError((e as Error).message);
    }
  };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginBusy) return;
    if (security.enabled && !verificationToken) {
      setLoginError("Vui lòng hoàn tất xác minh.");
      return;
    }
    setLoginBusy(true);
    try {
      await api("/api/admin", {
        method: "POST",
        body: JSON.stringify({ password: inputPassword, verificationToken }),
      });
      setIsAuthenticated(true);
      setLoginError("");
      await loadAdminData();
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoginBusy(false);
      setVerificationToken("");
      setVerificationReset((value) => value + 1);
    }
  };
  const handleLogout = async () => {
    try {
      await api("/api/admin", { method: "DELETE" });
      setIsAuthenticated(false);
      setConfig(null);
      setInputPassword("");
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({ config, questions }),
      });
      alert("Đã lưu cấu hình chung cho toàn bộ thí sinh.");
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Mật khẩu xác nhận không khớp.");
      return;
    }
    try {
      await api("/api/admin", {
        method: "PUT",
        body: JSON.stringify({ password: newPassword }),
      });
      setIsAuthenticated(false);
      setConfig(null);
      setInputPassword("");
      setLoginError("Đã đổi mật khẩu. Hãy đăng nhập lại.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPasswordMsg((e as Error).message);
    }
  };
  // Thêm đơn vị mới
  const handleAddUnit = () => {
    if (!config || !newUnitName.trim()) return;
    const exists = config.units.some(
      (u) => u.name.toLowerCase() === newUnitName.trim().toLowerCase(),
    );
    if (exists) {
      alert("Đơn vị này đã tồn tại trong danh sách!");
      return;
    }
    if (!Number.isSafeInteger(newUnitTarget) || newUnitTarget < 0) {
      alert("Số lượng phải là số nguyên từ 0 trở lên.");
      return;
    }
    const updatedUnits: UnitTarget[] = [
      ...config.units,
      { name: newUnitName.trim(), targetCount: newUnitTarget },
    ];
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);

    setNewUnitName("");
  };

  // Xóa đơn vị
  const handleDeleteUnit = (index: number) => {
    if (!config) return;
    const updatedUnits = config.units.filter((_, i) => i !== index);
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);
  };

  // Cập nhật chỉ tiêu quân số đơn vị
  const handleUpdateUnitTarget = (index: number, count: number) => {
    if (!config) return;
    const updatedUnits = [...config.units];
    updatedUnits[index].targetCount = count;
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);
  };

  const handleUnitsImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setUnitsImportBusy(true);
    setUnitsImportStatus("Đang đọc danh sách đơn vị...");
    try {
      const units = await parseExcelUnits(file);
      setConfig((current) => (current ? { ...current, units } : current));
      setUnitsImportStatus(
        `Đã nạp ${units.length} đơn vị. Bấm Lưu cấu hình để áp dụng danh sách mới.`,
      );
    } catch (error) {
      setUnitsImportStatus(`Lỗi: ${(error as Error).message}`);
    } finally {
      setUnitsImportBusy(false);
      input.value = "";
    }
  };

  // Upload file excel câu hỏi mới
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadStatus("Đang đọc và phân tích file Excel...");
      const parsedQuestions = await parseExcelQuestions(file);

      setQuestions(parsedQuestions);

      // Tự động điều chỉnh số lượng câu hỏi thi nếu cấu hình vượt quá số câu
      if (config && config.questionCount > parsedQuestions.length) {
        const updatedCfg = { ...config, questionCount: parsedQuestions.length };
        setConfig(updatedCfg);
      }

      setUploadStatus(
        `Đã đọc ${parsedQuestions.length} câu hỏi. Nhấn Lưu Cấu Hình để cập nhật lên server.`,
      );
    } catch (err: any) {
      setUploadStatus(`Lỗi: ${err.message || "Không thể đọc file"}`);
    }
  };

  const handleClearResults = async () => {
    if (
      !confirm(
        "Bắt đầu kỳ thi mới? Số lượng dự thi sẽ tính lại từ đầu; lịch sử kỳ thi cũ vẫn được lưu.",
      )
    )
      return;
    try {
      await api("/api/results", { method: "DELETE" });
      alert("Đã bắt đầu kỳ thi mới, giữ nguyên cấu hình và ngân hàng câu hỏi.");
      void loadHistory();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // Chưa đăng nhập -> Hiện Form Đăng Nhập
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-center text-slate-900 mb-1">
            Đăng Nhập Trang Quản Trị
          </h2>
          <p className="text-xs text-center text-slate-500 mb-6">
            Dùng mật khẩu quản trị được cấu hình trên server.
          </p>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Mật Khẩu Quản Trị
              </label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu..."
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {security.enabled &&
              (security.siteKey ? (
                <Verification
                  siteKey={security.siteKey}
                  action="admin_login"
                  onToken={setVerificationToken}
                  resetKey={verificationReset}
                />
              ) : (
                <p role="alert" className="text-red-700">
                  Xác minh chưa được cấu hình.
                </p>
              ))}
            <button
              type="submit"
              disabled={loginBusy || (security.enabled && !verificationToken)}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-md transition-all"
            >
              Đăng Nhập Quản Trị
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!config)
    return (
      <p>
        {loginError || "Đang tải cấu hình..."}
        <button onClick={() => void loadAdminData()} className="ml-3 underline">
          Thử lại
        </button>
      </p>
    );

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Bảng Điều Khiển Quản Trị
          </h1>
          <p className="text-sm text-slate-500">
            Quản lý kỳ thi, ngân hàng câu hỏi, cấu hình đảo đề và quân số đơn vị
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm shadow-sm transition-all flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Cấu Hình</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-all flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Thoát</span>
          </button>
        </div>
      </div>

      <section className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-bold">Lịch sử lượt thi các kỳ</h2>
          <div className="flex gap-3">
            <button
              onClick={() => void loadHistory()}
              className="text-brand-700"
            >
              Làm mới
            </button>
            <button
              onClick={() => void exportAllSubmittedExcel()}
              disabled={excelBusy || dataBusy}
              className="text-brand-700 disabled:opacity-50"
            >
              {excelBusy ? "Đang xuất Excel..." : "Xuất Excel toàn bộ"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Mỗi trang 50 lượt nộp. Xuất Excel lấy toàn bộ lượt nộp bài ở tất cả
          các kỳ thi, kể cả các lần thi lại. Nên đóng kỳ thi trước khi xuất để
          danh sách không thay đổi trong lúc tải.
        </p>
        {excelMessage && (
          <p role="status" className="text-sm text-brand-700">
            {excelMessage}
          </p>
        )}
        <div className="flex gap-4">
          <button
            disabled={historyBusy || historyCursor.length === 1}
            onClick={() => {
              const pages = historyCursor.slice(0, -1);
              void loadHistory(pages[pages.length - 1], pages);
            }}
          >
            Trang trước
          </button>
          <span>Trang {historyCursor.length}</span>
          <button
            disabled={historyBusy || !nextCursor}
            onClick={() => {
              if (nextCursor)
                void loadHistory(nextCursor, [...historyCursor, nextCursor]);
            }}
          >
            Trang sau
          </button>
        </div>
        {historyError && <p className="text-red-700">{historyError}</p>}
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="p-2">Mã thí sinh</th>
                <th className="p-2">Viết tắt họ tên</th>
                <th className="p-2">Số điện thoại</th>
                <th className="p-2">Đơn vị</th>
                <th className="p-2">Điểm</th>
                <th className="p-2">Thời điểm nộp</th>
                <th className="p-2">Giám sát local</th>
                <th className="p-2">Kỳ thi</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    {r.userInfo.candidateCode ||
                      r.userInfo.serviceNumber ||
                      r.id}
                  </td>
                  <td className="p-2">{r.userInfo.nameInitials || "—"}</td>
                  <td className="p-2">{r.userInfo.phone || "—"}</td>
                  <td className="p-2">{r.userInfo.unit}</td>
                  <td className="p-2">{r.score}/10</td>
                  <td className="p-2">
                    {new Date(r.submittedAt).toLocaleString("vi-VN")}
                  </td>
                  <td className="p-2 text-xs">
                    {r.localMonitoring
                      ? `${r.localMonitoring.leaveCount} lần rời • ${Math.round(r.localMonitoring.totalAwayMs / 1000)} giây${r.localMonitoring.terminationReason === "away" ? " • Tự kết thúc do rời màn hình" : ""} (trình duyệt báo cáo)`
                      : "—"}
                  </td>
                  <td className="p-2">{r.examId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CỘT 1 & 2: CẤU HÌNH KỲ THI & ĐƠN VỊ */}
        <div className="lg:col-span-2 space-y-8">
          {/* Cấu hình chung kỳ thi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 border-b pb-3 flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-600" />
              Thiết Lập Kỳ Thi & Quy Chế
            </h3>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiêu Đề Kỳ Thi
                </label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) =>
                    setConfig({ ...config, title: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô Tả / Hướng Dẫn
                </label>
                <textarea
                  rows={2}
                  value={config.description}
                  onChange={(e) =>
                    setConfig({ ...config, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số lượng câu hỏi trong mỗi đề thi
                </label>
                <input
                  type="number"
                  min={1}
                  max={questions.length}
                  value={config.questionCount}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      questionCount: Number(e.target.value),
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Tổng ngân hàng hiện có {questions.length} câu
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tổng thời gian làm bài (Phút)
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.totalTimeMinutes}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      totalTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Hết giờ hệ thống tự động thu nộp bài
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngưỡng điểm Đạt (%) để tính chỉ số tập thể
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={config.passingScorePercent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      passingScorePercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Mặc định: 80% (tương đương &ge;8.0 điểm)
                </p>
              </div>
            </div>

            {/* Các tùy chọn Checkbox */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.shuffleQuestions}
                  onChange={(e) =>
                    setConfig({ ...config, shuffleQuestions: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Xáo trộn thứ tự các câu hỏi (Đảo câu ngẫu nhiên)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.shuffleOptions}
                  onChange={(e) =>
                    setConfig({ ...config, shuffleOptions: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Xáo trộn thứ tự các đáp án A, B, C, D (Chống nhìn bài nhau)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowReview}
                  onChange={(e) =>
                    setConfig({ ...config, allowReview: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Cho phép xem lại đáp án đúng sau khi nộp bài
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isOpen}
                  onChange={(e) =>
                    setConfig({ ...config, isOpen: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Trạng thái:{" "}
                  <span
                    className={
                      config.isOpen
                        ? "text-emerald-600 font-bold"
                        : "text-red-500 font-bold"
                    }
                  >
                    {config.isOpen ? "ĐANG MỞ THI" : "TẠM KHÓA THI"}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-slate-900">
              Giám sát màn hình thi (xử lý trên máy thí sinh)
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.monitorEnabled ?? true}
                onChange={(e) =>
                  setConfig({ ...config, monitorEnabled: e.target.checked })
                }
              />
              Che bài khi rời tab, cửa sổ hoặc ứng dụng
            </label>
            <label className="block text-sm">
              Thời gian rời tối đa (5–300 giây)
              <input
                type="number"
                min={5}
                max={300}
                value={config.maxAwaySeconds ?? 30}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxAwaySeconds: Number(e.target.value),
                  })
                }
                className="ml-3 w-24 border rounded-lg px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.preventCopy ?? true}
                onChange={(e) =>
                  setConfig({ ...config, preventCopy: e.target.checked })
                }
              />
              Hạn chế sao chép câu hỏi và đáp án
            </label>
            <p className="text-xs text-slate-500">
              Quá hạn sẽ kết thúc lượt và nộp đáp án đã lưu khi rời màn hình.
              Đồng hồ tổng vẫn chạy. Cấu hình chỉ áp dụng cho lượt mới; không
              gửi request giám sát.
            </p>
          </section>

          {/* Quản lý danh sách đơn vị */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-brand-600" />
                Danh Sách Đơn Vị
              </h3>
              <span className="text-xs text-slate-500">
                Số lượng không bắt buộc
              </span>
            </div>

            <div className="rounded-xl bg-brand-50 p-4 space-y-3">
              <p className="text-sm text-slate-600">
                Excel gồm cột <strong>Tên đơn vị</strong> và{" "}
                <strong>Số lượng</strong> (có thể bỏ trống, lưu là 0). Nhập file
                sẽ thay toàn bộ danh sách đang chỉnh sửa. Bấm Lưu cấu hình để áp
                dụng.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <label
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium ${unitsImportBusy ? "opacity-50" : "cursor-pointer hover:bg-brand-700"}`}
                >
                  <Upload className="w-4 h-4" /> Nhập danh sách Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    aria-label="Nhập danh sách đơn vị từ Excel"
                    className="sr-only"
                    disabled={unitsImportBusy}
                    onChange={handleUnitsImport}
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadUnitTemplate}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  Tải file mẫu
                </button>
              </div>
              {unitsImportStatus && (
                <p role="status" className="text-sm text-slate-700">
                  {unitsImportStatus}
                </p>
              )}
            </div>

            {/* Form thêm đơn vị */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Tên đơn vị mới (Ví dụ: Chi đoàn Hải đội 1)"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="number"
                min={0}
                aria-label="Số lượng đơn vị mới"
                placeholder="Số lượng"
                value={newUnitTarget}
                onChange={(e) => setNewUnitTarget(Number(e.target.value))}
                className="w-full sm:w-36 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={handleAddUnit}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Tên Đơn Vị</th>
                    <th className="py-2.5 px-4 text-center w-36">Số Lượng</th>
                    <th className="py-2.5 px-4 text-center w-16">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {config.units.map((u, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {u.name}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <input
                          type="number"
                          min={0}
                          aria-label={`Số lượng ${u.name}`}
                          value={u.targetCount}
                          onChange={(e) =>
                            handleUpdateUnitTarget(idx, Number(e.target.value))
                          }
                          className="w-24 text-center px-2 py-1 rounded-lg border border-slate-200 text-sm"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => handleDeleteUnit(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* CỘT 3: IMPORT EXCEL & ĐỔI MẬT KHẨU & BẢO TRÌ */}
        <div className="space-y-8">
          {/* Nạp File Excel Câu Hỏi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Nạp File Excel Câu Hỏi Mới
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cấu trúc chuẩn 7 cột:{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">
                TT, Question, A, B, C, D, Correct
              </code>{" "}
              (giống như file{" "}
              <span className="font-semibold text-slate-700">
                NGHIQUYETDHXIII.xlsx
              </span>
              ).
            </p>

            <label className="block p-4 border-2 border-dashed border-emerald-300 rounded-xl hover:bg-emerald-50/50 cursor-pointer text-center transition-all">
              <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <span className="text-sm font-semibold text-emerald-700 block">
                Chọn file Excel (.xlsx) để nạp
              </span>
              <span className="text-xs text-slate-400">
                Nhấn Lưu Cấu Hình sau khi nạp câu hỏi
              </span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                className="hidden"
              />
            </label>

            {uploadStatus && (
              <p className="text-xs p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                {uploadStatus}
              </p>
            )}

            <div className="text-xs text-slate-500 border-t pt-3">
              Ngân hàng hiện tại:{" "}
              <span className="font-bold text-brand-600">
                {questions.length} câu hỏi
              </span>
            </div>
          </div>

          {/* Đổi Mật Khẩu Admin */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-5 h-5 text-brand-600" />
              Đổi Mật Khẩu Quản Trị
            </h3>

            {passwordMsg && (
              <p className="text-xs p-2.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
                {passwordMsg}
              </p>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu mới
                </label>
                <input
                  type="password"
                  placeholder="Ít nhất 10 ký tự"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Xác nhận mật khẩu
                </label>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-sm transition-all"
              >
                Cập Nhật Mật Khẩu
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-red-200 p-6 space-y-3">
            <h3 className="text-sm font-bold text-red-900">
              Xuất và xóa dữ liệu bài thi
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Xuất toàn bộ các kỳ thi, đáp án, hồ sơ thí sinh và phiên bản đề ra
              JSON. Nên đóng kỳ thi trước khi xuất để tránh dữ liệu thay đổi
              trong lúc tải. File này là bản sao dữ liệu; web chưa hỗ trợ nhập
              lại tự động.
            </p>
            <button
              disabled={dataBusy || excelBusy}
              onClick={exportAllExamData}
              className="w-full py-2.5 rounded-xl border border-brand-300 text-brand-700 font-semibold text-xs disabled:opacity-50"
            >
              Xuất toàn bộ dữ liệu bài thi (JSON)
            </button>
            <button
              disabled={dataBusy || excelBusy}
              onClick={() => {
                setShowDelete(true);
                setDeletePassword("");
                setDeleteError("");
              }}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white font-semibold text-xs disabled:opacity-50"
            >
              Xóa toàn bộ dữ liệu bài thi
            </button>
            {dataMessage && (
              <p role="status" className="text-xs text-slate-700">
                {dataMessage}
              </p>
            )}
            {showDelete && (
              <form
                onSubmit={deleteAllExamData}
                className="border-t border-red-200 pt-3 space-y-3"
              >
                <p className="text-xs text-red-700">
                  Xóa vĩnh viễn tất cả lượt thi (kể cả đang làm) và kết quả của
                  mọi kỳ. Kỳ thi sẽ đóng. Giữ hồ sơ thí sinh, danh sách đơn vị,
                  ngân hàng câu hỏi và tài khoản Admin. Hãy kiểm tra bản xuất đã
                  lưu trước khi xác nhận. Không thể hoàn tác bằng đổi phiên bản
                  web.
                </p>
                <label
                  className="block text-xs font-semibold"
                  htmlFor="delete-exam-password"
                >
                  Nhập lại mật khẩu Admin
                </label>
                <input
                  id="delete-exam-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={200}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={dataBusy || excelBusy}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                {deleteError && (
                  <p role="alert" className="text-xs text-red-700">
                    {deleteError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={dataBusy || excelBusy}
                    onClick={() => {
                      setShowDelete(false);
                      setDeletePassword("");
                    }}
                    className="px-3 py-2 border rounded-xl text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    disabled={dataBusy || !deletePassword}
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs disabled:opacity-50"
                  >
                    {dataBusy ? "Đang xử lý..." : "Xác nhận xóa vĩnh viễn"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Xóa Dữ Liệu Thi Cũ */}
          <div className="bg-red-50/50 rounded-2xl border border-red-200 p-6 space-y-3">
            <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Quản Lý Đợt Thi
            </h3>
            <p className="text-xs text-red-700 leading-relaxed">
              Mở đợt thi mới và tính lại bảng xếp hạng. Lịch sử lượt thi cũ được
              giữ trong database.
            </p>
            <button
              onClick={handleClearResults}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Bắt Đầu Kỳ Thi Mới</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
