import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { digest } from "./server";
import { RequestError } from "./request-security";
import { isAttemptToken } from "./attempt-token-format";

function signingKey() {
  const key = process.env.EXAM_TOKEN_SECRET || process.env.TURNSTILE_SECRET_KEY;
  if (!key || key.length < 32)
    throw new RequestError(
      "Chưa cấu hình khóa bảo vệ phiên thi. Liên hệ Admin.",
      503,
      "SECURITY_NOT_CONFIGURED",
    );
  return key;
}
function signature(nonce: string) {
  return createHmac("sha256", signingKey())
    .update("quiz-attempt-v2:" + nonce)
    .digest("hex");
}
export function issueAttemptToken() {
  const nonce = randomBytes(32).toString("hex");
  return `v2.${nonce}.${signature(nonce)}`;
}

// Compatibility only checks an allowlist of legacy token hashes. Unknown tokens
// never trigger individual lookups. One shared, bounded read per worker/5 min.
let legacy: { expires: number; values: Promise<Set<string>> } | undefined;
export function invalidateLegacyAttemptCache() {
  legacy = undefined;
}
async function legacyTokens() {
  if (!legacy || legacy.expires <= Date.now()) {
    const values = prisma.$queryRaw<{ token: string }[]>`
      SELECT "token" FROM "Attempt" WHERE "config"->>'attemptTokenVersion' IS NULL LIMIT 100001`.then(
      (rows) => {
        if (rows.length > 100000)
          throw new RequestError(
            "Danh sách phiên cũ quá lớn. Liên hệ Admin để chuyển đổi.",
            503,
          );
        return new Set(rows.map((row) => row.token));
      },
    );
    const entry = { expires: Date.now() + 300000, values };
    legacy = entry;
    values.catch(() => {
      if (legacy === entry) entry.expires = Date.now() + 30000;
    });
  }
  return legacy.values;
}
export async function authorizeAttemptToken(raw: unknown) {
  if (!isAttemptToken(raw))
    throw new RequestError(
      "Mã phiên thi không hợp lệ.",
      401,
      "ATTEMPT_INVALID",
    );
  if (raw.startsWith("v2.")) {
    const [, nonce, mac] = raw.split(".");
    if (
      !timingSafeEqual(
        Buffer.from(mac, "hex"),
        Buffer.from(signature(nonce), "hex"),
      )
    )
      throw new RequestError(
        "Mã phiên thi không hợp lệ.",
        401,
        "ATTEMPT_INVALID",
      );
  } else if (
    process.env.LEGACY_ATTEMPT_COMPAT === "false" ||
    !(await legacyTokens()).has(digest(raw))
  ) {
    throw new RequestError(
      "Phiên thi không còn hợp lệ. Hãy đăng ký lại.",
      410,
      "ATTEMPT_GONE",
    );
  }
  return raw;
}

const buckets = new Map<string, { started: number; count: number }>();
export function limitAttemptRequests(raw: string, submit: boolean) {
  const now = Date.now();
  const key = (submit ? "submit:" : "read:") + digest(raw);
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.started >= 60000) {
    if (buckets.size >= 20000) {
      for (const [key, value] of buckets)
        if (now - value.started >= 60000) buckets.delete(key);
      if (buckets.size >= 20000)
        throw new RequestError(
          "Hệ thống đang bận. Thử lại sau ít phút.",
          429,
          "RATE_LIMITED",
        );
    }
    bucket = { started: now, count: 0 };
    buckets.set(key, bucket);
  }
  if (++bucket.count > (submit ? 6 : 30))
    throw new RequestError(
      "Phiên thi gửi yêu cầu quá nhanh. Chờ một phút rồi thử lại; bài vẫn được giữ trên máy.",
      429,
      "RATE_LIMITED",
    );
}
