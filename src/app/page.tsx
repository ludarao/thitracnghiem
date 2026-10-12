"use client";
import { formatServiceNumberInput } from "../lib/service-number-input";
import Verification from "../components/Verification";

import { useExamTab } from "../components/useExamTab";
import ExamGuardDialog from "../components/ExamGuardDialog";
import {
  emptyGuard,
  leaveExam,
  returnToExam,
  checkAway,
  continueExam,
  monitoringReport,
  type GuardState,
} from "../lib/local-exam-guard";
import {
  parseLocalAttempt,
  quarantineAttempt,
  LOCAL_ATTEMPT_KEY,
} from "../lib/local-attempt";
import React, { useState, useEffect, useRef } from "react";
import { api } from "../lib/client";
import { ExamConfig, Question, UserInfo, ExamResult } from "../types/quiz";
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  User,
  Building2,
  ChevronRight,
  ChevronLeft,
  Send,
  Trophy,
  RefreshCcw,
  BarChart,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";

type Session = {
  userInfo: UserInfo;
  config: ExamConfig;
  questions: Question[];
  answers: Record<number, string>;
  currentIndex: number;
  serverTime: number;
  deadline: string;
  result: ExamResult | null;
};
export default function ExamPage() {
  const ownership = useExamTab();
  const [guard, setGuard] = useState<GuardState>(emptyGuard);
  const guardRef = useRef<GuardState>(emptyGuard());
  const [protectionNow, setProtectionNow] = useState(0);
  const [screenPresent, setScreenPresent] = useState(true);
  const [copyNotice, setCopyNotice] = useState("");
  const [recovery, setRecovery] = useState<{
    raw: string;
    token: string | null;
    backedUp: boolean;
  } | null>(null);
  const initialized = useRef(false);
  const [security, setSecurity] = useState({ enabled: false, siteKey: "" });
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationReset, setVerificationReset] = useState(0);
  const [registrationReady, setRegistrationReady] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const registrationPending = useRef(false);
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [examState, setExamState] = useState<
    "REGISTER" | "IN_PROGRESS" | "FINISHED"
  >("REGISTER");
  const [userInfo, setUserInfo] = useState<UserInfo>({
    serviceNumber: "",
    unit: "",
  });
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, string>
  >({});
  const [timeRemainingTotal, setTimeRemainingTotal] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const tokenRef = useRef("");
  const clockOffset = useRef(0);
  const pending = useRef(false);
  const apply = (data: Session) => {
    sessionRef.current = data;
    clockOffset.current = data.serverTime - Date.now();
    setConfig(data.config);
    setUserInfo(data.userInfo);
    setExamQuestions(data.questions);
    setSelectedAnswers(data.answers);
    setTimeRemainingTotal(
      Math.max(
        0,
        Math.ceil((Date.parse(data.deadline) - data.serverTime) / 1000),
      ),
    );
    if (data.result) {
      setResult(data.result);
      setExamState("FINISHED");
    } else setExamState("IN_PROGRESS");
  };
  const frozen = useRef<Record<number, string> | null>(null);
  const saveLocal = (data: Session) => {
    if (ownership.status !== "owned")
      throw new Error("Bài đang được mở ở tab khác.");
    localStorage.setItem(
      "quiz_local_attempt_v2",
      JSON.stringify({
        version: 3,
        guard: guardRef.current,
        token: tokenRef.current,
        session: data,
        offset: clockOffset.current,
        frozen: frozen.current,
      }),
    );
    sessionRef.current = data;
  };
  const submit = async () => {
    if (
      ownership.status !== "owned" ||
      pending.current ||
      !sessionRef.current ||
      sessionRef.current.result
    )
      return;
    try {
      if (!frozen.current) {
        frozen.current = { ...sessionRef.current.answers };
        saveLocal(sessionRef.current);
      }
    } catch {
      setError("Không lưu được bài trên máy. Giữ trang này mở và thử nộp lại.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const data = await api<Session>("/api/exam", {
        method: "PATCH",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: "Bearer " + tokenRef.current },
        body: JSON.stringify({
          action: "submit",
          answers: frozen.current,
          ...(sessionRef.current.config.monitorEnabled
            ? {
                localMonitoring: monitoringReport(guardRef.current, Date.now()),
              }
            : {}),
        }),
      });
      apply(data);
      try {
        saveLocal(data);
      } catch {
        /* Server has confirmed the result. */
      }
      setError("");
    } catch (e) {
      setError(
        (e as Error).message +
          " Bài đã khóa và được giữ trên máy. Có mạng hãy bấm Thử nộp lại.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const loadRegistrationConfig = async () => {
    if (registrationPending.current) return;
    registrationPending.current = true;
    setRegistrationReady(false);
    setRegistrationLoading(true);
    setVerificationToken("");
    setVerificationReset((value) => value + 1);
    try {
      const data = await api("/api/config");
      if (
        typeof data.security?.enabled !== "boolean" ||
        typeof data.security?.siteKey !== "string"
      )
        throw new Error("Không tải được cấu hình xác minh. Vui lòng thử lại.");
      setConfig(data.config);
      setSecurity(data.security);
      setUserInfo((prev) => ({
        ...prev,
        unit: data.config.units.some(
          (unit: { name: string }) => unit.name === prev.unit,
        )
          ? prev.unit
          : data.config.units[0]?.name || "",
      }));
      setRegistrationReady(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      registrationPending.current = false;
      setRegistrationLoading(false);
    }
  };
  const commitGuard = (next: GuardState) => {
    if (next === guardRef.current) return;
    guardRef.current = next;
    setGuard(next);
    const session = sessionRef.current;
    if (next.endedReason && !session?.result && !frozen.current)
      frozen.current = { ...(next.awayAnswers ?? session?.answers ?? {}) };
    try {
      if (session) saveLocal(session);
    } catch {
      setError(
        "Không lưu được trạng thái bài trên máy. Giữ trang này mở; lượt đã bị khóa để tránh mất đáp án.",
      );
      frozen.current ??= { ...(session?.answers ?? {}) };
    }
    if (next.endedReason && !session?.result) void submit();
  };
  const checkProtection = () => {
    const session = sessionRef.current;
    if (!session || session.result || ownership.status !== "owned") return;
    const now = Date.now();
    setProtectionNow(now);
    if (session.config.monitorEnabled)
      commitGuard(
        checkAway(
          guardRef.current,
          now,
          (session.config.maxAwaySeconds ?? 30) * 1000,
          Date.parse(session.deadline) - clockOffset.current,
        ),
      );
  };
  const canInteract = () => {
    if (
      ownership.status !== "owned" ||
      frozen.current ||
      guardRef.current.endedReason ||
      guardRef.current.awaySince !== null
    )
      return false;
    const session = sessionRef.current;
    if (
      session?.config.monitorEnabled &&
      (document.hidden || !document.hasFocus())
    ) {
      commitGuard(leaveExam(guardRef.current, Date.now(), session.answers));
      return false;
    }
    checkProtection();
    return !frozen.current && guardRef.current.awaySince === null;
  };
  useEffect(() => {
    if (ownership.status !== "owned" || initialized.current) return;
    initialized.current = true;
    const load = async () => {
      try {
        const local = localStorage.getItem(LOCAL_ATTEMPT_KEY);
        if (local) {
          let saved;
          try {
            saved = parseLocalAttempt(local);
          } catch {
            let backedUp = false;
            try {
              quarantineAttempt(localStorage, local, Date.now());
              backedUp = true;
            } catch {
              /* Keep the original if backup fails. */
            }
            setRecovery({
              raw: local,
              token: local.match(/"token"\s*:\s*"([a-f0-9]{64})"/)?.[1] ?? null,
              backedUp,
            });
            await loadRegistrationConfig();
            return;
          }
          tokenRef.current = saved.token;
          frozen.current = saved.frozen ?? null;
          let next = saved.guard;
          const present = !document.hidden && document.hasFocus();
          setScreenPresent(present);
          if (!saved.session.result && saved.session.config.monitorEnabled) {
            const deadline = Date.parse(saved.session.deadline) - saved.offset;
            if (present)
              next = returnToExam(
                next,
                Date.now(),
                (saved.session.config.maxAwaySeconds ?? 30) * 1000,
                deadline,
              );
            else next = leaveExam(next, Date.now(), saved.session.answers);
            next = checkAway(
              next,
              Date.now(),
              (saved.session.config.maxAwaySeconds ?? 30) * 1000,
              deadline,
            );
            if (next.endedReason)
              frozen.current ??= {
                ...(next.awayAnswers ?? saved.session.answers),
              };
          }
          guardRef.current = next;
          setGuard(next);
          apply({ ...saved.session, serverTime: Date.now() + saved.offset });
          setCurrentIndex(saved.session.currentIndex ?? 0);
          saveLocal({
            ...saved.session,
            serverTime: Date.now() + saved.offset,
          });
          if (frozen.current && !saved.session.result) void submit();
          return;
        }
        const old = localStorage.getItem("quiz_active_attempt");
        if (old) {
          tokenRef.current = old;
          const data = await api<Session>("/api/exam", {
            headers: { Authorization: "Bearer " + old },
          });
          apply(data);
          saveLocal(data);
          return;
        }
        await loadRegistrationConfig();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void load();
  }, [ownership.status]);
  useEffect(() => {
    if (ownership.status !== "owned") return;
    const online = () => {
      if (frozen.current) void submit();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [ownership.status]);
  useEffect(() => {
    if (examState !== "IN_PROGRESS" || ownership.status !== "owned") return;
    const session = sessionRef.current;
    const leave = () => {
      if (
        !sessionRef.current?.config.monitorEnabled ||
        sessionRef.current.result ||
        frozen.current
      )
        return;
      setScreenPresent(false);
      commitGuard(
        leaveExam(guardRef.current, Date.now(), sessionRef.current.answers),
      );
    };
    const back = () => {
      const present = !document.hidden && document.hasFocus();
      setScreenPresent(present);
      if (!present) return;
      if (sessionRef.current?.config.monitorEnabled)
        commitGuard(
          returnToExam(
            guardRef.current,
            Date.now(),
            (sessionRef.current.config.maxAwaySeconds ?? 30) * 1000,
            Date.parse(sessionRef.current.deadline) - clockOffset.current,
          ),
        );
    };
    const visibility = () => (document.hidden ? leave() : back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", back);
    if (document.hidden || !document.hasFocus()) leave();
    else back();
    const tick = () => {
      checkProtection();
      const data = sessionRef.current;
      if (!data) return;
      const remaining = Math.max(
        0,
        Math.ceil(
          (Date.parse(data.deadline) - Date.now() - clockOffset.current) / 1000,
        ),
      );
      setTimeRemainingTotal(remaining);
      if (remaining === 0 && !frozen.current) void submit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", back);
    };
  }, [examState, ownership.status]);
  const protectionDialog = () => {
    if (guard.acknowledged || (!guard.endedReason && guard.awaySince === null))
      return null;
    return (
      <ExamGuardDialog
        ended={guard.endedReason}
        seconds={Math.max(
          0,
          Math.floor(
            ((guard.returnedAt ?? protectionNow) -
              (guard.awaySince ?? protectionNow)) /
              1000,
          ),
        )}
        limit={config?.maxAwaySeconds ?? 30}
        present={screenPresent}
        busy={busy}
        error={error}
        hasResult={!!result}
        onContinue={() => {
          if (document.hidden || !document.hasFocus()) return;
          checkProtection();
          if (!guardRef.current.endedReason)
            commitGuard(continueExam(guardRef.current));
        }}
        onRetry={() => void submit()}
        onClose={() => {
          if (result) commitGuard({ ...guardRef.current, acknowledged: true });
        }}
      />
    );
  };
  const blockCopy = (event: React.SyntheticEvent) => {
    if (sessionRef.current?.config.preventCopy) {
      event.preventDefault();
      setCopyNotice("Không sao chép câu hỏi hoặc đáp án trong lúc thi.");
    }
  };
  useEffect(() => {
    if (ownership.status !== "owned") return;
    const update = () =>
      setScreenPresent(!document.hidden && document.hasFocus());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [ownership.status]);
  const handleServiceNumberInput = (value: string) => {
    try {
      const serviceNumber = formatServiceNumberInput(value);
      setUserInfo((prev) => ({ ...prev, serviceNumber }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || ownership.status !== "owned" || recovery) return;
    if (!registrationReady || registrationPending.current) {
      setError("Vui lòng chờ tải cấu hình đăng ký hoặc bấm tải lại cấu hình.");
      return;
    }
    if (security.enabled && !verificationToken) {
      setError("Vui lòng hoàn tất xác minh trước khi bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("quiz_storage_check", "1");
      localStorage.removeItem("quiz_storage_check");
      const data = await api("/api/exam", {
        method: "POST",
        body: JSON.stringify({ userInfo, verificationToken }),
      });
      tokenRef.current = data.token;
      frozen.current = null;
      guardRef.current = emptyGuard();
      setGuard(guardRef.current);
      setCopyNotice("");
      apply(data);
      saveLocal(data);
      setCurrentIndex(0);
      localStorage.removeItem("quiz_active_attempt");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerificationToken("");
      setVerificationReset((value) => value + 1);
      setBusy(false);
    }
  };
  const handleSelectOption = (option: string) => {
    const data = sessionRef.current;
    if (
      !data ||
      !canInteract() ||
      frozen.current ||
      Date.now() + clockOffset.current >= Date.parse(data.deadline)
    )
      return;
    const updated = {
      ...data,
      answers: { ...data.answers, [examQuestions[currentIndex].id]: option },
      currentIndex,
    };
    try {
      saveLocal(updated);
      setSelectedAnswers(updated.answers);
      setError("");
    } catch {
      setError(
        "Không lưu được đáp án trên máy. Hãy giải phóng dung lượng trình duyệt.",
      );
    }
  };
  const navigate = (index: number) => {
    if (!sessionRef.current || !canInteract()) return;
    try {
      saveLocal({ ...sessionRef.current, currentIndex: index });
      setCurrentIndex(index);
    } catch {
      setError("Không lưu được tiến độ trên máy.");
    }
  };
  const handleSubmitExam = () => {
    if (frozen.current || canInteract()) void submit();
  };

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (ownership.status !== "owned")
    return (
      <div
        className="max-w-lg mx-auto p-6 bg-white rounded-2xl border space-y-4"
        role="alert"
      >
        <h1 className="font-bold text-xl">
          {ownership.status === "pending"
            ? "Đang kiểm tra phiên thi..."
            : ownership.status === "blocked"
              ? "Bài thi đang mở ở tab khác"
              : "Trình duyệt chưa hỗ trợ khóa phiên thi"}
        </h1>
        <p>
          {ownership.status === "blocked"
            ? "Chỉ một tab được phép làm bài để tránh ghi đè đáp án. Đóng tab thi kia rồi bấm thử lại."
            : "Hãy dùng trình duyệt cập nhật và truy cập qua HTTPS. Dữ liệu bài trên máy vẫn được giữ."}
        </p>
        {ownership.status !== "pending" && (
          <button
            onClick={ownership.retry}
            className="underline text-brand-700"
          >
            Thử nhận phiên
          </button>
        )}
      </div>
    );
  if (recovery)
    return (
      <div
        className="bg-white max-w-xl mx-auto rounded-2xl border p-6 space-y-4"
        role="alert"
      >
        <h1 className="text-xl font-bold text-brand-700">
          Bản lưu trên máy bị lỗi
        </h1>
        <p>
          {recovery.backedUp
            ? "Đã giữ bản sao để phục hồi; dữ liệu chưa bị xóa vĩnh viễn."
            : "Chưa lưu được bản sao. Hãy tải bản lưu trước khi đặt lại."}{" "}
          Server có thể chưa nhận các đáp án chọn offline.
        </p>
        {error && <p className="text-red-700">{error}</p>}
        <button
          className="underline mr-4"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([recovery.raw], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "ban-luu-bai-thi.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Tải bản lưu lỗi
        </button>
        <button
          disabled={!recovery.token || busy}
          className="underline mr-4 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const data = await api<Session>("/api/exam", {
                headers: { Authorization: "Bearer " + recovery.token },
              });
              tokenRef.current = recovery.token!;
              guardRef.current = emptyGuard();
              setGuard(guardRef.current);
              frozen.current = null;
              apply(data);
              saveLocal(data);
              setRecovery(null);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Phục hồi từ server
        </button>
        <button
          className="underline text-brand-700"
          onClick={() => {
            if (
              !recovery.backedUp &&
              !confirm(
                "Bản sao chưa lưu được. Bạn đã tải bản lưu và muốn bắt đầu lượt mới?",
              )
            )
              return;
            localStorage.removeItem(LOCAL_ATTEMPT_KEY);
            localStorage.removeItem("quiz_active_attempt");
            setRecovery(null);
            setError("");
            void loadRegistrationConfig();
          }}
        >
          Đặt lại để đăng ký lượt mới
        </button>
      </div>
    );
  if (!config) {
    if (error)
      return (
        <div className="p-6 text-red-700">
          {error}
          <button
            onClick={() => void loadRegistrationConfig()}
            disabled={registrationLoading}
            className="ml-4 underline"
          >
            Thử lại
          </button>
        </div>
      );
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  // Giao diện Đăng ký / Điền thông tin
  if (examState === "REGISTER") {
    return (
      <div className="registration-layout grid lg:grid-cols-[1fr_1.05fr] gap-8 lg:gap-14 items-start py-6 sm:py-10">
        <section className="registration-intro lg:sticky lg:top-40 py-4 lg:py-16">
          <span className="inline-flex items-center gap-2 text-brand-800 text-xs font-bold uppercase tracking-[0.18em] mb-5">
            <span className="h-px w-8 bg-brand-700" aria-hidden="true" /> Cổng
            thi trực tuyến
          </span>
          <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-brand-700 leading-[1.2] tracking-tight">
            {config.title}
          </h1>
          <p className="mt-6 text-lg sm:text-xl leading-relaxed text-brand-800 max-w-xl">
            {config.description}
          </p>
          <div className="mt-8 pt-6 border-t border-amber-400/60 flex gap-6 text-brand-900">
            <div>
              <p className="text-3xl font-bold">{config.questionCount}</p>
              <p className="text-sm mt-1">Câu hỏi mỗi bài</p>
            </div>
            <div className="w-px bg-amber-400/60" aria-hidden="true" />
            <div>
              <p className="text-3xl font-bold">
                {config.totalTimeMinutes}
                <span className="text-base font-medium ml-2">phút</span>
              </p>
              <p className="text-sm mt-1">Thời gian làm bài</p>
            </div>
          </div>
          <p className="mt-7 text-sm leading-relaxed text-stone-700">
            Điền thông tin để bắt đầu dự thi. Bạn có thể thi lại; hệ thống ghi
            nhận kết quả cao nhất qua các lần thi.
          </p>
        </section>
        <div className="bg-white rounded-2xl shadow-xl shadow-amber-900/10 border border-amber-200 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-700 to-brand-900 p-6 sm:p-8 text-white text-center relative overflow-hidden">
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/20 backdrop-blur-sm mb-3">
                Cổng Thi Trực Tuyến
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                Đăng ký dự thi
              </h2>
              <p className="text-brand-100 text-sm max-w-xl mx-auto">
                Hoàn tất thông tin để nhận đề thi của bạn.
              </p>
            </div>
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="p-6 sm:p-8">
            {!config.isOpen && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Thông báo:</strong> Cổng thi hiện đang tạm khóa hoặc
                  chưa mở. Vui lòng liên hệ Quản trị viên để được mở quyền thi.
                </div>
              </div>
            )}

            {/* Thông số đề thi */}
            <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
              <div>
                <p className="text-xs text-slate-500 font-medium">Số câu thi</p>
                <p className="text-base font-bold text-slate-800">
                  {config.questionCount} câu
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">
                  Thời gian tổng
                </p>
                <p className="text-base font-bold text-slate-800">
                  {config.totalTimeMinutes} phút
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Ngưỡng đạt</p>
                <p className="text-base font-bold text-emerald-600">
                  {config.passingScorePercent}%
                </p>
              </div>
            </div>

            <form onSubmit={handleStartExam} className="space-y-4">
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              <h3 className="text-base font-semibold text-slate-900 border-b pb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600" />
                Thông tin người dự thi (Bắt buộc)
              </h3>

              <div>
                <label
                  htmlFor="service-number"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  1. Số hiệu <span className="text-red-500">*</span>
                </label>
                <input
                  id="service-number"
                  type="text"
                  required
                  maxLength={7}
                  inputMode="numeric"
                  pattern="[0-9]{3}-[0-9]{3}"
                  title="Nhập 6 chữ số, ví dụ 650-695"
                  aria-describedby="service-number-hint"
                  autoComplete="off"
                  placeholder="Ví dụ: 649-605"
                  value={userInfo.serviceNumber || ""}
                  onChange={(e) => handleServiceNumberInput(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    handleServiceNumberInput(e.clipboardData.getData("text"));
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
                <p
                  id="service-number-hint"
                  className="text-xs text-slate-500 mt-1"
                >
                  Nhập 6 chữ số, dấu gạch ngang được thêm tự động (650695 →
                  650-695). Số hiệu cũng là mã thí sinh. Dùng cùng số hiệu khi
                  thi lại; hệ thống ghi nhận điểm cao nhất.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  2. Đơn vị <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <select
                    required
                    value={userInfo.unit}
                    onChange={(e) =>
                      setUserInfo({ ...userInfo, unit: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
                  >
                    {config.units.map((u) => (
                      <option key={u.name} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  * Bạn được ghi nhận đã dự thi tại đơn vị của lượt có điểm cao
                  nhất (bằng điểm lấy lượt nộp mới hơn).
                </p>
              </div>

              <div className="pt-4">
                {config.monitorEnabled && (
                  <p className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                    Khi rời tab, cửa sổ, chuyển ứng dụng hoặc khóa màn hình, bài
                    sẽ bị che. Rời từ {config.maxAwaySeconds ?? 30} giây liên
                    tục sẽ kết thúc lượt và nộp đáp án đã lưu. Đồng hồ tổng vẫn
                    chạy.
                  </p>
                )}
                {!registrationReady && (
                  <div className="mb-3 text-sm text-slate-600" role="status">
                    {registrationLoading ? (
                      "Đang tải cấu hình đăng ký và xác minh..."
                    ) : (
                      <button
                        type="button"
                        className="underline text-brand-700"
                        onClick={() => void loadRegistrationConfig()}
                      >
                        Tải lại cấu hình đăng ký
                      </button>
                    )}
                  </div>
                )}
                {registrationReady &&
                  security.enabled &&
                  (security.siteKey ? (
                    <Verification
                      siteKey={security.siteKey}
                      action="exam_start"
                      onToken={setVerificationToken}
                      resetKey={verificationReset}
                    />
                  ) : (
                    <p role="alert" className="text-red-700">
                      Xác minh chưa được cấu hình. Vui lòng liên hệ quản trị
                      viên.
                    </p>
                  ))}
                <button
                  type="submit"
                  disabled={
                    !registrationReady ||
                    registrationLoading ||
                    !config.isOpen ||
                    busy ||
                    (security.enabled && !verificationToken)
                  }
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-brand-600 to-brand-600 text-white font-semibold text-base shadow-lg shadow-brand-500/25 hover:from-brand-700 hover:to-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  <span>
                    {busy ? "Đang tạo lượt thi..." : "Bắt Đầu Làm Bài Thi"}
                  </span>
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
  if (examState === "IN_PROGRESS") {
    const currentQuestion = examQuestions[currentIndex];
    if (!currentQuestion)
      return (
        <div>
          Đang lưu bài... {error}
          <button onClick={handleSubmitExam}>Thử nộp lại</button>
        </div>
      );
    const totalQ = examQuestions.length;
    const answeredCount = Object.keys(selectedAnswers).length;
    const progressPercent = Math.round((answeredCount / totalQ) * 100);

    return (
      <div className="max-w-4xl mx-auto py-2 sm:py-6 space-y-4">
        {protectionDialog()}
        {copyNotice && (
          <p role="status" className="text-sm text-brand-700">
            {copyNotice}
          </p>
        )}
        {error && (
          <p role="alert" className="p-3 bg-red-50 text-red-700">
            {error}
            <button onClick={handleSubmitExam} className="ml-3 underline">
              Thử nộp lại
            </button>
          </p>
        )}
        <p className="text-sm text-slate-600">
          Mã thí sinh: <strong>{userInfo.candidateCode}</strong>
          {busy
            ? " • Đang nộp..."
            : frozen.current
              ? " • Đã khóa, chờ xác nhận nộp"
              : " • Đáp án được lưu trên máy"}
        </p>
        {/* Thanh trạng thái Header bài thi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-18 z-40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center font-bold">
                {currentIndex + 1}/{totalQ}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {userInfo.serviceNumber || userInfo.candidateCode}
                </p>
                <p className="text-xs text-slate-500">{userInfo.unit}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Tổng thời gian */}
              <div
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold shadow-sm ${
                  timeRemainingTotal <= 180
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-slate-900 text-white"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{formatTime(timeRemainingTotal)}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-brand-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Nội dung câu hỏi */}
        <div
          className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 ${config.preventCopy ? "select-none" : ""}`}
          onCopy={blockCopy}
          onCut={blockCopy}
          onContextMenu={blockCopy}
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              ["c", "x"].includes(event.key.toLowerCase())
            )
              blockCopy(event);
          }}
          inert={guard.awaySince !== null || !!guard.endedReason}
        >
          <div className="mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md">
              Câu hỏi {currentIndex + 1}
            </span>
            <h2 className="text-lg sm:text-xl font-medium text-slate-900 mt-3 leading-relaxed">
              {currentQuestion.question}
            </h2>
          </div>

          {/* Các lựa chọn A, B, C, D */}
          <div className="space-y-3">
            {(["A", "B", "C", "D"] as const).map((key) => {
              const optionText = currentQuestion.options[key];
              if (!optionText) return null;
              const isSelected = selectedAnswers[currentQuestion.id] === key;

              return (
                <button
                  key={key}
                  disabled={
                    busy || !!frozen.current || timeRemainingTotal === 0
                  }
                  onClick={() => handleSelectOption(key)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                    isSelected
                      ? "border-brand-600 bg-brand-50/70 text-brand-900 ring-2 ring-brand-500/20"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {key}
                  </div>
                  <span className="text-sm sm:text-base leading-snug pt-0.5">
                    {optionText}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Điều hướng Next / Prev */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => navigate(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0 || busy}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            <span className="text-xs text-slate-400">
              Đã làm {answeredCount}/{totalQ} câu
            </span>

            {currentIndex === totalQ - 1 &&
            examQuestions.every((q) => Boolean(selectedAnswers[q.id])) ? (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    canInteract() &&
                    confirm("Bạn đã trả lời đủ câu hỏi. Xác nhận nộp bài?")
                  )
                    handleSubmitExam();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                <span>Nộp Bài</span>
              </button>
            ) : (
              <button
                onClick={() => navigate(Math.min(totalQ - 1, currentIndex + 1))}
                disabled={busy || currentIndex === totalQ - 1}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span>Câu sau</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
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
                  disabled={busy}
                  onClick={() => navigate(idx)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-brand-600 text-white ring-2 ring-brand-600 ring-offset-2"
                      : isAnswered
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
  if (examState === "FINISHED" && result) {
    return (
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        {protectionDialog()}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden text-center p-8">
          <div
            className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-4 ${
              result.isPassed
                ? "bg-emerald-100 text-emerald-600"
                : "bg-amber-100 text-amber-600"
            }`}
          >
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {result.isPassed
              ? "CHÚC MỪNG BẠN ĐÃ HOÀN THÀNH XUẤT SẮC!"
              : "BẠN ĐÃ HOÀN THÀNH BÀI THI"}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Thí sinh:{" "}
            <span className="font-semibold text-slate-700">
              {result.userInfo.serviceNumber || result.userInfo.candidateCode}
            </span>{" "}
            ({result.userInfo.unit})
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Điểm số</p>
              <p className="text-3xl font-extrabold text-brand-600">
                {result.score}
                <span className="text-sm text-slate-400">/10</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Số câu đúng</p>
              <p className="text-3xl font-extrabold text-slate-800">
                {result.correctCount}
                <span className="text-sm text-slate-400">
                  /{result.totalQuestions}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tỷ lệ chính xác</p>
              <p className="text-3xl font-extrabold text-emerald-600">
                {result.percentage}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Thời gian làm</p>
              <p className="text-2xl font-bold text-slate-700 pt-1">
                {formatTime(result.totalDurationSeconds)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm shadow-md shadow-brand-500/20 transition-all flex items-center gap-2"
            >
              <BarChart className="w-4 h-4" />
              <span>Xem Số Lượng Dự Thi</span>
            </Link>

            <button
              onClick={() => {
                localStorage.removeItem("quiz_active_attempt");
                localStorage.removeItem("quiz_local_attempt_v2");
                frozen.current = null;
                guardRef.current = emptyGuard();
                setGuard(guardRef.current);
                setCopyNotice("");
                tokenRef.current = "";
                sessionRef.current = null;
                setRegistrationReady(false);
                setError("");
                setExamState("REGISTER");
                setResult(null);
                void loadRegistrationConfig();
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
                  <div
                    key={q.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Câu {idx + 1}: {q.question}
                      </p>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                          isCorrect
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {isCorrect ? "Đúng" : "Sai"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {(["A", "B", "C", "D"] as const).map((k) => {
                        const opt = q.options[k];
                        if (!opt) return null;
                        const isChosen = userAns === k;
                        const isRightAnswer = q.correct === k;

                        let style = "bg-white border-slate-200 text-slate-700";
                        if (isRightAnswer) {
                          style =
                            "bg-emerald-50 border-emerald-300 text-emerald-900 font-medium ring-1 ring-emerald-400";
                        } else if (isChosen && !isRightAnswer) {
                          style =
                            "bg-red-50 border-red-300 text-red-800 line-through";
                        }

                        return (
                          <div
                            key={k}
                            className={`p-2.5 rounded-lg border flex items-center gap-2 ${style}`}
                          >
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
