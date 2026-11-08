"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { parseExcelQuestions } from "../lib/excel";
import {
  replaceQuestionSet,
  validateQuestionSetPlan,
} from "../lib/question-sets";
import type { Question, QuestionSet } from "../types/quiz";

type Props = {
  sets: QuestionSet[];
  questions: Question[];
  questionCount: number;
  disabled: boolean;
  onChange: (sets: QuestionSet[], questions: Question[]) => void;
  onBusyChange: (busy: boolean) => void;
};

export default function QuestionSetsEditor(props: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const pending = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const { sets, questions, questionCount, disabled, onChange } = props;
  const locked = busy || disabled;
  const total = sets.reduce((sum, set) => sum + set.questionCount, 0);
  const available = new Map<string, number>();
  for (const q of questions)
    available.set(q.setId!, (available.get(q.setId!) || 0) + 1);
  let error = "";
  try {
    validateQuestionSetPlan({ questionSets: sets, questionCount }, questions);
  } catch (e) {
    error = (e as Error).message;
  }

  const upload = async (setId: string, input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file || pending.current || latest.current.disabled) return;
    pending.current = true;
    setBusy(true);
    latest.current.onBusyChange(true);
    setStatus("Đang đọc file câu hỏi...");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("File Excel tối đa 5 MB.");
      const parsed = await parseExcelQuestions(file);
      const current = latest.current;
      const set = current.sets.find((item) => item.id === setId);
      if (!set) throw new Error("Bộ câu hỏi không còn tồn tại.");
      current.onChange(
        current.sets,
        replaceQuestionSet(current.questions, setId, parsed),
      );
      setStatus(
        `Đã nạp ${parsed.length} câu vào ${set.name}. Các bộ khác được giữ nguyên. Bấm Lưu Cấu Hình để áp dụng.`,
      );
    } catch (e) {
      setStatus("Lỗi: " + (e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
      latest.current.onBusyChange(false);
      input.value = "";
    }
  };

  return (
    <section
      aria-labelledby="question-sets-title"
      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
    >
      <h3
        id="question-sets-title"
        className="text-base font-bold text-slate-900 flex items-center gap-2"
      >
        <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Các bộ câu hỏi
        & phân bổ đề
      </h3>
      <p className="text-sm text-slate-600">
        Thêm bộ theo từng chương, nạp Excel riêng rồi đặt số câu lấy vào mỗi đề.
        Nạp lại một bộ chỉ thay câu hỏi của bộ đó. Đặt 0 để tạm không lấy câu từ
        bộ.
      </p>
      <p className="text-xs text-slate-500">
        Mỗi file giữ cấu trúc 7 cột:{" "}
        <code>TT, Question, A, B, C, D, Correct</code>. TT có thể bắt đầu lại từ
        1 trong từng file.
      </p>
      <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
        {sets.map((set, index) => (
          <div
            key={set.id}
            className="rounded-xl border border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <label
                htmlFor={`set-name-${set.id}`}
                className="text-xs text-slate-500 shrink-0"
              >
                Tên bộ {index + 1}
              </label>
              <input
                id={`set-name-${set.id}`}
                value={set.name}
                maxLength={120}
                onChange={(e) =>
                  onChange(
                    sets.map((s) =>
                      s.id === set.id ? { ...s, name: e.target.value } : s,
                    ),
                    questions,
                  )
                }
                className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                aria-label={`Xóa ${set.name}`}
                disabled={sets.length === 1}
                onClick={() => {
                  if (
                    !confirm(
                      `Xóa ${set.name} cùng ${available.get(set.id) || 0} câu khỏi cấu hình đang chỉnh? Thay đổi chỉ áp dụng sau khi lưu.`,
                    )
                  )
                    return;
                  onChange(
                    sets.filter((s) => s.id !== set.id),
                    questions.filter((q) => q.setId !== set.id),
                  );
                  setStatus(
                    "Đã bỏ bộ khỏi bản đang chỉnh. Kiểm tra lại phân bổ rồi lưu cấu hình.",
                  );
                }}
                className="p-2 text-red-600 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <label className="text-sm space-y-1">
                <span className="block text-slate-600">
                  Số câu lấy từ {set.name}
                </span>
                <input
                  aria-label={`Số câu lấy từ ${set.name}`}
                  type="number"
                  min={0}
                  max={available.get(set.id) || 0}
                  step={1}
                  value={set.questionCount}
                  onChange={(e) =>
                    onChange(
                      sets.map((s) =>
                        s.id === set.id
                          ? { ...s, questionCount: Number(e.target.value) }
                          : s,
                      ),
                      questions,
                    )
                  }
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="text-xs text-slate-500">
                Đã nạp: {available.get(set.id) || 0} câu
              </div>
              <label
                className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-sm ${locked ? "opacity-50" : "cursor-pointer hover:bg-emerald-50"}`}
              >
                <Upload className="w-4 h-4" /> Nạp Excel
                <input
                  aria-label={`Nạp Excel cho ${set.name}`}
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={locked}
                  onChange={(e) => void upload(set.id, e.currentTarget)}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer"
                />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={sets.length >= 1000}
          onClick={() => {
            const names = new Set(sets.map((s) => s.name.trim().toLowerCase()));
            let number = sets.length + 1;
            while (names.has(`bộ ${number}`)) number++;
            onChange(
              [
                ...sets,
                {
                  id: crypto.randomUUID(),
                  name: `Bộ ${number}`,
                  questionCount: 0,
                },
              ],
              questions,
            );
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3 py-2 text-brand-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Thêm bộ câu hỏi
        </button>
      </fieldset>
      <p
        className={`rounded-lg p-3 text-sm font-semibold ${error ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
      >
        Đã phân bổ {total}/{questionCount} câu · Tổng ngân hàng{" "}
        {questions.length} câu
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-slate-600">
          {status}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Bấm Lưu Cấu Hình để áp dụng. Các lượt đã bắt đầu vẫn giữ đề và cấu hình
        cũ.
      </p>
    </section>
  );
}
