'use client';

import React, { useState, useEffect } from 'react';
import { 
  getStorageConfig, 
  saveStorageConfig, 
  getStorageQuestions, 
  saveStorageQuestions,
  getAdminPassword,
  setAdminPassword,
  clearAllResults,
  getStorageResults
} from '../../lib/storage';
import { parseExcelQuestions } from '../../lib/excel';
import { ExamConfig, Question, UnitTarget } from '../../types/quiz';
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
  Eye,
  LogOut,
  Layers
} from 'lucide-react';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Cấu hình
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitTarget, setNewUnitTarget] = useState<number>(30);

  // Mật khẩu mới
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  // Tải file excel
  const [uploadStatus, setUploadStatus] = useState<string>('');

  useEffect(() => {
    // Check session
    const adminSession = sessionStorage.getItem('admin_authenticated');
    if (adminSession === 'true') {
      setIsAuthenticated(true);
      loadAdminData();
    }
  }, []);

  const loadAdminData = () => {
    setConfig(getStorageConfig());
    setQuestions(getStorageQuestions());
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const currentPass = getAdminPassword();
    if (inputPassword === currentPass) {
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_authenticated', 'true');
      setLoginError('');
      loadAdminData();
    } else {
      setLoginError('Mật khẩu quản trị viên không chính xác!');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_authenticated');
    setIsAuthenticated(false);
    setInputPassword('');
  };

  const handleSaveConfig = () => {
    if (!config) return;
    saveStorageConfig(config);
    alert('Đã lưu cấu hình kỳ thi thành công!');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Mật khẩu xác nhận không trùng khớp!');
      return;
    }
    setAdminPassword(newPassword);
    setPasswordMsg('Đã đổi mật khẩu Admin thành công!');
    setNewPassword('');
    setConfirmPassword('');
  };

  // Thêm đơn vị mới
  const handleAddUnit = () => {
    if (!config || !newUnitName.trim()) return;
    const exists = config.units.some(u => u.name.toLowerCase() === newUnitName.trim().toLowerCase());
    if (exists) {
      alert('Đơn vị này đã tồn tại trong danh sách!');
      return;
    }
    const updatedUnits: UnitTarget[] = [
      ...config.units,
      { name: newUnitName.trim(), targetCount: Number(newUnitTarget) || 20 }
    ];
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);
    saveStorageConfig(updatedConfig);
    setNewUnitName('');
  };

  // Xóa đơn vị
  const handleDeleteUnit = (index: number) => {
    if (!config) return;
    const updatedUnits = config.units.filter((_, i) => i !== index);
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);
    saveStorageConfig(updatedConfig);
  };

  // Cập nhật chỉ tiêu quân số đơn vị
  const handleUpdateUnitTarget = (index: number, count: number) => {
    if (!config) return;
    const updatedUnits = [...config.units];
    updatedUnits[index].targetCount = count;
    const updatedConfig = { ...config, units: updatedUnits };
    setConfig(updatedConfig);
  };

  // Upload file excel câu hỏi mới
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadStatus('Đang đọc và phân tích file Excel...');
      const parsedQuestions = await parseExcelQuestions(file);
      saveStorageQuestions(parsedQuestions);
      setQuestions(parsedQuestions);

      // Tự động điều chỉnh số lượng câu hỏi thi nếu cấu hình vượt quá số câu
      if (config && config.questionCount > parsedQuestions.length) {
        const updatedCfg = { ...config, questionCount: parsedQuestions.length };
        setConfig(updatedCfg);
        saveStorageConfig(updatedCfg);
      }

      setUploadStatus(`Thành công! Đã nạp ${parsedQuestions.length} câu hỏi mới vào ngân hàng.`);
    } catch (err: any) {
      setUploadStatus(`Lỗi: ${err.message || 'Không thể đọc file'}`);
    }
  };

  // Reset toàn bộ kết quả thi
  const handleClearResults = () => {
    const results = getStorageResults();
    if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ ${results.length} kết quả thi hiện tại để bắt đầu kỳ thi mới không?`)) {
      clearAllResults();
      alert('Đã làm sạch dữ liệu kết quả thi!');
    }
  };

  // Chưa đăng nhập -> Hiện Form Đăng Nhập
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-center text-slate-900 mb-1">
            Đăng Nhập Trang Quản Trị
          </h2>
          <p className="text-xs text-center text-slate-500 mb-6">
            Mật khẩu mặc định hệ thống: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono">admin123</code>
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all"
            >
              Đăng Nhập Quản Trị
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bảng Điều Khiển Quản Trị</h1>
          <p className="text-sm text-slate-500">Quản lý kỳ thi, ngân hàng câu hỏi, cấu hình đảo đề và quân số đơn vị</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-sm transition-all flex items-center gap-1.5"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CỘT 1 & 2: CẤU HÌNH KỲ THI & ĐƠN VỊ */}
        <div className="lg:col-span-2 space-y-8">
          {/* Cấu hình chung kỳ thi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 border-b pb-3 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              Thiết Lập Kỳ Thi & Quy Chế
            </h3>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu Đề Kỳ Thi</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô Tả / Hướng Dẫn</label>
                <textarea
                  rows={2}
                  value={config.description}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) => setConfig({ ...config, questionCount: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Tổng ngân hàng hiện có {questions.length} câu</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tổng thời gian làm bài (Phút)
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.totalTimeMinutes}
                  onChange={(e) => setConfig({ ...config, totalTimeMinutes: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Hết giờ hệ thống tự động thu nộp bài</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Giới hạn thời gian từng câu (Giây, 0 = Không giới hạn)
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.timePerQuestionSeconds}
                  onChange={(e) => setConfig({ ...config, timePerQuestionSeconds: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Hết số giây sẽ tự động chuyển câu tiếp theo</p>
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
                  onChange={(e) => setConfig({ ...config, passingScorePercent: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Mặc định: 80% (tương đương &ge;8.0 điểm)</p>
              </div>
            </div>

            {/* Các tùy chọn Checkbox */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.shuffleQuestions}
                  onChange={(e) => setConfig({ ...config, shuffleQuestions: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Xáo trộn thứ tự các câu hỏi (Đảo câu ngẫu nhiên)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.shuffleOptions}
                  onChange={(e) => setConfig({ ...config, shuffleOptions: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Xáo trộn thứ tự các đáp án A, B, C, D (Chống nhìn bài nhau)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowReview}
                  onChange={(e) => setConfig({ ...config, allowReview: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Cho phép xem lại đáp án đúng sau khi nộp bài
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isOpen}
                  onChange={(e) => setConfig({ ...config, isOpen: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Trạng thái: <span className={config.isOpen ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                    {config.isOpen ? 'ĐANG MỞ THI' : 'TẠM KHÓA THI'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Quản lý danh sách đơn vị & quân số để tính tỷ lệ tham gia */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-blue-600" />
                Danh Sách Đơn Vị & Quân Số Đăng Ký
              </h3>
              <span className="text-xs text-slate-500">Cơ sở tính Tỷ lệ tham gia thi đua</span>
            </div>

            {/* Form thêm đơn vị */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Tên đơn vị mới (Ví dụ: Chi đoàn Hải đội 1)"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                min={1}
                placeholder="Tổng quân số"
                value={newUnitTarget}
                onChange={(e) => setNewUnitTarget(Number(e.target.value))}
                className="w-full sm:w-36 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddUnit}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-1.5"
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
                    <th className="py-2.5 px-4 text-center w-36">Tổng Quân Số</th>
                    <th className="py-2.5 px-4 text-center w-16">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {config.units.map((u, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">{u.name}</td>
                      <td className="py-2.5 px-4 text-center">
                        <input
                          type="number"
                          min={1}
                          value={u.targetCount}
                          onChange={(e) => handleUpdateUnitTarget(idx, Number(e.target.value))}
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
              Cấu trúc chuẩn 7 cột: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">TT, Question, A, B, C, D, Correct</code> (giống như file <span className="font-semibold text-slate-700">NGHIQUYETDHXIII.xlsx</span>).
            </p>

            <label className="block p-4 border-2 border-dashed border-emerald-300 rounded-xl hover:bg-emerald-50/50 cursor-pointer text-center transition-all">
              <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <span className="text-sm font-semibold text-emerald-700 block">Chọn file Excel (.xlsx) để nạp</span>
              <span className="text-xs text-slate-400">Hệ thống sẽ cập nhật ngay ngân hàng đề</span>
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
              Ngân hàng hiện tại: <span className="font-bold text-blue-600">{questions.length} câu hỏi</span>
            </div>
          </div>

          {/* Đổi Mật Khẩu Admin */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" />
              Đổi Mật Khẩu Quản Trị
            </h3>

            {passwordMsg && (
              <p className="text-xs p-2.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                {passwordMsg}
              </p>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu mới</label>
                <input
                  type="password"
                  placeholder="Ít nhất 6 ký tự"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Xác nhận mật khẩu</label>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Xóa Dữ Liệu Thi Cũ */}
          <div className="bg-red-50/50 rounded-2xl border border-red-200 p-6 space-y-3">
            <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Khu Vực Nguy Hiểm
            </h3>
            <p className="text-xs text-red-700 leading-relaxed">
              Xóa sạch các lượt thi hiện tại của thí sinh để bắt đầu một đợt thi mới hoặc làm mới bảng xếp hạng.
            </p>
            <button
              onClick={handleClearResults}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset Toàn Bộ Kết Quả Thi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
