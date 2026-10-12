export type OwnershipStatus = "pending" | "owned" | "blocked" | "unsupported";
/** One local writer per origin; the browser releases Web Locks on tab close. */
export function claimExamTab(
  locks: LockManager | undefined,
  onStatus: (status: OwnershipStatus) => void,
) {
  let cancelled = false;
  let release: (() => void) | undefined;
  onStatus("pending");
  if (!locks) {
    onStatus("unsupported");
    return () => {};
  }
  void locks
    .request("quiz-exam-owner-v1", { ifAvailable: true }, async (lock) => {
      if (cancelled) return;
      if (!lock) {
        onStatus("blocked");
        return;
      }
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      onStatus("owned");
      await held;
    })
    .catch(() => {
      if (!cancelled) onStatus("unsupported");
    });
  return () => {
    cancelled = true;
    release?.();
  };
}
