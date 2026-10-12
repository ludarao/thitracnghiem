export const attemptTokenPattern =
  /^(?:[a-f0-9]{64}|v2\.[a-f0-9]{64}\.[a-f0-9]{64})$/;
export function isAttemptToken(value: unknown): value is string {
  return typeof value === "string" && attemptTokenPattern.test(value);
}
