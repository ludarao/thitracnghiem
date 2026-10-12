"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, Users, Trophy } from "lucide-react";
import { api } from "../../lib/client";

type Dashboard = {
  asOf: string;
  countsAsOf: string;
  totalParticipants: number;
  results: {
    id: string;
    maskedCandidateCode: string;
    score: number;
    totalDurationSeconds: number;
    userInfo: { unit: string };
  }[];
  page: number;
  pageSize: number;
  totalPages: number;
  units: { unit: string; participantCount: number }[];
  unitsPage: number;
  unitsPageSize: number;
  totalUnits: number;
  unitsTotalPages: number;
};
function Pagination({
  label,
  page,
  pages,
  total,
  busy,
  onPage,
}: {
  label: string;
  page: number;
  pages: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm"
    >
      <span className="text-slate-500">
        Trang {page}/{pages} · Tổng {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
          className="px-3 py-2 border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-brand-50"
        >
          Trang trước
        </button>
        <button
          type="button"
          disabled={busy || page >= pages}
          onClick={() => onPage(page + 1)}
          className="px-3 py-2 border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-brand-50"
        >
          Trang sau
        </button>
      </div>
    </nav>
  );
}
function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  return `${Math.floor(seconds / 60)} phút ${Math.floor(seconds % 60)} giây`;
}
export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const current = useRef<Dashboard | null>(null);
  const load = async (
    page = current.current?.page || 1,
    unitsPage = current.current?.unitsPage || 1,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dashboard: "1",
        page: String(page),
        unitsPage: String(unitsPage),
      });
      const next = await api<Dashboard>("/api/results?" + params);
      current.current = next;
      setData(next);
      setError("");
    } catch {
      setError("Không tải được thống kê dự thi. Vui lòng thử lại.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="max-w-6xl mx-auto space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
          <Users className="w-6 h-6" />
          Số lượng dự thi
        </h1>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Mỗi thí sinh đã nộp bài được tính một lần trong kỳ hiện tại. Lấy điểm
        cao nhất; cùng điểm lấy lượt nhanh nhất, cùng thời gian lấy lượt nộp mới
        hơn. Mã thí sinh che 4 số cuối điện thoại.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading && !data && (
        <p role="status" className="text-slate-500">
          Đang tải thống kê...
        </p>
      )}
      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5 items-start">
          <section
            aria-labelledby="candidate-ranks"
            aria-busy={loading}
            className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm"
          >
            <div className="p-5 border-b border-amber-100 bg-brand-50/50 space-y-1">
              <h2
                id="candidate-ranks"
                className="font-bold text-brand-700 flex items-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                Xếp hạng thí sinh
              </h2>
              <p className="text-xs text-slate-500">
                Điểm cao trước, cùng điểm ưu tiên thời gian ngắn hơn · 20
                người/trang
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="p-3">
                      Hạng
                    </th>
                    <th scope="col" className="p-3">
                      Mã thí sinh
                    </th>
                    <th scope="col" className="p-3">
                      Đơn vị
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Điểm
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Thời gian
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row, index) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3 font-semibold text-brand-700">
                        {(data.page - 1) * data.pageSize + index + 1}
                      </td>
                      <td className="p-3 font-medium whitespace-nowrap">
                        {row.maskedCandidateCode}
                      </td>
                      <td className="p-3">{row.userInfo.unit}</td>
                      <td className="p-3 text-right font-bold text-brand-700">
                        {row.score}/10
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {duration(row.totalDurationSeconds)}
                      </td>
                    </tr>
                  ))}
                  {!data.results.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-slate-500"
                      >
                        Chưa có thí sinh nộp bài.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Phân trang thí sinh"
              page={data.page}
              pages={data.totalPages}
              total={data.totalParticipants}
              busy={loading}
              onPage={(page) => void load(page, data.unitsPage)}
            />
            <p className="px-4 pb-4 text-xs text-slate-400">
              Cập nhật lúc {new Date(data.asOf).toLocaleString("vi-VN")}.
            </p>
          </section>
          <section
            aria-labelledby="unit-ranks"
            aria-busy={loading}
            className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm"
          >
            <div className="p-5 border-b border-amber-100 bg-brand-50/50 space-y-1">
              <h2
                id="unit-ranks"
                className="font-bold text-brand-700 flex items-center gap-2"
              >
                <Users className="w-5 h-5" />
                Xếp hạng đơn vị
              </h2>
              <p className="text-xs text-slate-500">
                Số người đã dự thi từ nhiều đến ít · 10 đơn vị/trang
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="p-3">
                      Hạng
                    </th>
                    <th scope="col" className="p-3">
                      Đơn vị
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Số người dự thi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((row, index) => (
                    <tr key={row.unit} className="border-t border-slate-100">
                      <td className="p-3 font-semibold text-brand-700">
                        {(data.unitsPage - 1) * data.unitsPageSize + index + 1}
                      </td>
                      <td className="p-3 font-medium">{row.unit}</td>
                      <td className="p-3 text-right font-bold text-brand-700">
                        {row.participantCount}
                      </td>
                    </tr>
                  ))}
                  {!data.units.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-6 text-center text-slate-500"
                      >
                        Chưa có đơn vị.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Phân trang đơn vị"
              page={data.unitsPage}
              pages={data.unitsTotalPages}
              total={data.totalUnits}
              busy={loading}
              onPage={(page) => void load(data.page, page)}
            />
            <p className="px-4 pb-4 text-xs text-slate-400">
              Cập nhật lúc {new Date(data.countsAsOf).toLocaleString("vi-VN")}.
            </p>
          </section>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Bấm Làm mới khi cần; thống kê có thể cập nhật chậm vài phút.
      </p>
    </div>
  );
}
