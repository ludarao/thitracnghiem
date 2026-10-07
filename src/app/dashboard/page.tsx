"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Users } from "lucide-react";
import { api } from "../../lib/client";

type Participation = {
  asOf: string;
  units: { unit: string; participantCount: number }[];
};
export default function DashboardPage() {
  const [data, setData] = useState<Participation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const next = await api<Participation>("/api/results?counts=1");
      setData(next);
      setError("");
    } catch {
      setError("Không tải được số lượng dự thi. Vui lòng thử lại.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="max-w-4xl mx-auto space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6" />
          Số lượng đã dự thi theo đơn vị
        </h1>
        <button
          disabled={loading}
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Mỗi thí sinh đã nộp bài được tính một lần trong kỳ thi hiện tại. Nếu thi
        lại, tính theo đơn vị của lượt nộp cuối.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="text-xs text-slate-500">
            Dữ liệu lúc {new Date(data.asOf).toLocaleString("vi-VN")}. Bấm Làm
            mới khi cần; dữ liệu có thể trễ vài phút do cache.
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="p-4">
                    Đơn vị
                  </th>
                  <th scope="col" className="p-4 text-right">
                    Số người đã dự thi
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((row) => (
                  <tr key={row.unit} className="border-t border-slate-100">
                    <td className="p-4 font-medium">{row.unit}</td>
                    <td className="p-4 text-right font-bold text-brand-700">
                      {row.participantCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
