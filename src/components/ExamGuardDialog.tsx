"use client";
import { useEffect, useRef } from "react";
export default function ExamGuardDialog({
  ended,
  seconds,
  limit,
  present,
  busy,
  error,
  hasResult,
  onContinue,
  onRetry,
  onClose,
}: {
  ended: "away" | "deadline" | null;
  seconds: number;
  limit: number;
  present: boolean;
  busy: boolean;
  error: string;
  hasResult: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (present)
      dialog.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [present, ended, hasResult, busy]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guard-title"
        className="bg-white border border-amber-200 rounded-2xl p-6 shadow-xl max-w-md w-full space-y-4"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault();
          if (event.key === "Tab") {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            if (!buttons.length) {
              event.preventDefault();
              return;
            }
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            event.preventDefault();
            buttons[
              (index + (event.shiftKey ? -1 : 1) + buttons.length) %
                buttons.length
            ]?.focus();
          }
        }}
      >
        <h2 id="guard-title" className="text-xl font-bold text-brand-700">
          {ended ? "Lượt thi đã kết thúc" : "Bạn đã rời màn hình thi"}
        </h2>
        <p className="text-sm text-slate-700">
          {ended === "away"
            ? `Bạn đã rời màn hình quá ${limit} giây. Bài đã khóa và dùng đáp án lưu khi rời màn hình.`
            : ended === "deadline"
              ? "Đã hết tổng thời gian làm bài. Bài đã được khóa."
              : `Bạn đã rời màn hình ${seconds} giây. Vui lòng quay lại trang thi để tiếp tục. Rời từ ${limit} giây sẽ kết thúc lượt.`}
        </p>
        {!present && (
          <p role="status" className="text-sm text-brand-700">
            Hãy quay về cửa sổ thi để thao tác.
          </p>
        )}
        {ended && (
          <p className="text-sm">
            {hasResult
              ? "Server đã xác nhận kết quả."
              : busy
                ? "Đang nộp bài..."
                : "Bài được giữ trên máy; nếu mất mạng, hãy thử nộp lại khi có kết nối."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {!ended && (
          <button
            type="button"
            disabled={!present}
            onClick={onContinue}
            className="w-full rounded-xl py-3 bg-brand-600 text-white disabled:opacity-50"
          >
            Tiếp tục làm bài
          </button>
        )}
        {ended && hasResult && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 bg-brand-600 text-white"
          >
            Xem kết quả
          </button>
        )}
        {ended && !hasResult && (
          <button
            type="button"
            disabled={busy || !present}
            onClick={onRetry}
            className="w-full rounded-xl py-3 bg-brand-600 text-white disabled:opacity-50"
          >
            Thử nộp lại
          </button>
        )}
      </div>
    </div>
  );
}
