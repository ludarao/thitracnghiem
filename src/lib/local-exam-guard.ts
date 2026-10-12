export type GuardState = {
  awaySince: number | null;
  returnedAt: number | null;
  awayAnswers: Record<string, string> | null;
  leaveCount: number;
  totalAwayMs: number;
  endedReason: "away" | "deadline" | null;
  acknowledged: boolean;
};
export const emptyGuard = (): GuardState => ({
  awaySince: null,
  returnedAt: null,
  awayAnswers: null,
  leaveCount: 0,
  totalAwayMs: 0,
  endedReason: null,
  acknowledged: false,
});
export function leaveExam(
  state: GuardState,
  now: number,
  answers: Record<string, string>,
): GuardState {
  if (
    state.endedReason ||
    (state.awaySince !== null && state.returnedAt === null)
  )
    return state;
  return {
    ...state,
    awaySince: now,
    returnedAt: null,
    awayAnswers: { ...answers },
    leaveCount: state.leaveCount + 1,
    acknowledged: false,
  };
}
export function checkAway(
  state: GuardState,
  now: number,
  limitMs: number,
  deadline: number,
): GuardState {
  if (state.endedReason || state.awaySince === null) return state;
  const awayDeadline = state.awaySince + limitMs;
  if (deadline <= now && deadline <= awayDeadline)
    return { ...state, endedReason: "deadline" };
  if ((state.returnedAt ?? now) >= awayDeadline)
    return { ...state, endedReason: "away" };
  return state;
}
export function returnToExam(
  state: GuardState,
  now: number,
  limitMs: number,
  deadline: number,
): GuardState {
  if (
    state.awaySince === null ||
    state.endedReason ||
    state.returnedAt !== null
  )
    return checkAway(state, now, limitMs, deadline);
  const returned = {
    ...state,
    returnedAt: now,
    totalAwayMs: state.totalAwayMs + Math.max(0, now - state.awaySince),
  };
  return checkAway(returned, now, limitMs, deadline);
}
export function continueExam(state: GuardState): GuardState {
  if (state.endedReason || state.returnedAt === null) return state;
  return { ...state, awaySince: null, returnedAt: null, awayAnswers: null };
}
export function protectionSettings(config: {
  monitorEnabled?: boolean;
  maxAwaySeconds?: number;
  preventCopy?: boolean;
}) {
  return {
    monitorEnabled: config.monitorEnabled ?? true,
    maxAwaySeconds: config.maxAwaySeconds ?? 30,
    preventCopy: config.preventCopy ?? true,
  };
}

export function monitoringReport(state: GuardState, now: number) {
  return {
    reportedByClient: true as const,
    leaveCount: state.leaveCount,
    totalAwayMs:
      state.totalAwayMs +
      (state.awaySince !== null && state.returnedAt === null
        ? Math.max(0, now - state.awaySince)
        : 0),
    terminationReason: state.endedReason,
  };
}
export function validateMonitoringReport(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Thông tin giám sát không hợp lệ.");
  const v = value as Record<string, unknown>;
  if (
    !Number.isInteger(v.leaveCount) ||
    (v.leaveCount as number) < 0 ||
    (v.leaveCount as number) > 10000 ||
    !Number.isFinite(v.totalAwayMs) ||
    (v.totalAwayMs as number) < 0 ||
    (v.totalAwayMs as number) > 604800000 ||
    ![null, "away", "deadline"].includes(
      v.terminationReason as null | "away" | "deadline",
    )
  )
    throw new Error("Thông tin giám sát không hợp lệ.");
  return {
    reportedByClient: true as const,
    leaveCount: v.leaveCount as number,
    totalAwayMs: v.totalAwayMs as number,
    terminationReason: v.terminationReason as null | "away" | "deadline",
  };
}
