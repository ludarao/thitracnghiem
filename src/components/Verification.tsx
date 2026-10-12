"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
export default function Verification({
  siteKey,
  action,
  onToken,
  resetKey,
}: {
  siteKey: string;
  action: string;
  onToken: (value: string) => void;
  resetKey: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!ready || !api || !container.current) return;
    setError("");
    callback.current("");
    const id = api.render(container.current, {
      sitekey: siteKey,
      action,
      size: "flexible",
      callback: (value: string) => {
        setError("");
        callback.current(value);
      },
      "expired-callback": () => {
        callback.current("");
        setError("Xác minh hết hạn. Bấm thử lại.");
      },
      "error-callback": () => {
        callback.current("");
        setError("Không xác minh được. Kiểm tra mạng rồi bấm thử lại.");
      },
      "timeout-callback": () => {
        callback.current("");
        setError("Xác minh quá thời gian. Bấm thử lại.");
      },
    });
    return () => {
      api.remove(id);
      callback.current("");
    };
  }, [ready, siteKey, action, resetKey, retry]);
  return (
    <div className="space-y-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
        onError={() =>
          setError(
            "Không tải được dịch vụ xác minh. Kiểm tra mạng hoặc tải lại trang.",
          )
        }
      />
      <div ref={container} />
      {!ready && !error && (
        <p role="status" className="text-sm text-slate-600">
          Đang tải xác minh...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {error && ready && (
        <button
          type="button"
          className="text-sm underline text-brand-700"
          onClick={() => setRetry((value) => value + 1)}
        >
          Thử xác minh lại
        </button>
      )}
    </div>
  );
}
