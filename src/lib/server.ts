import { isAttemptToken } from "./attempt-token-format";
import { RequestError } from "./request-security";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { DEFAULT_CONFIG } from "./storage";
import questions from "../data/questions.json";
export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password: string) {
  const salt = token();
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function settings() {
  const existing = await prisma.quizSettings.findUnique({
    where: { id: "main" },
  });
  if (existing) return existing;
  return prisma.quizSettings.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      questions,
    },
  });
}
function adminSignature(nonce: string) {
  const key = process.env.EXAM_TOKEN_SECRET || process.env.TURNSTILE_SECRET_KEY;
  if (!key || key.length < 32)
    throw new RequestError(
      "Chưa cấu hình khóa bảo vệ phiên. Liên hệ Admin.",
      503,
      "SECURITY_NOT_CONFIGURED",
    );
  return createHmac("sha256", key)
    .update("quiz-admin-session-v2:" + nonce)
    .digest("hex");
}
export function adminSessionToken() {
  const nonce = token();
  return `v2.${nonce}.${adminSignature(nonce)}`;
}
let legacyAdmins: { expires: number; values: Promise<Set<string>> } | undefined;
export async function isAdmin(req: NextRequest) {
  const raw = req.cookies.get("quiz_admin")?.value;
  if (!isAttemptToken(raw)) return false;
  if (raw.startsWith("v2.")) {
    const [, nonce, mac] = raw.split(".");
    if (
      !timingSafeEqual(
        Buffer.from(mac, "hex"),
        Buffer.from(adminSignature(nonce), "hex"),
      )
    )
      return false;
  } else {
    if (process.env.LEGACY_ADMIN_COMPAT === "false") return false;
    if (!legacyAdmins || legacyAdmins.expires <= Date.now()) {
      const entry = {
        expires: Date.now() + 300000,
        values: prisma.adminSession
          .findMany({
            where: { expiresAt: { gt: new Date() } },
            select: { token: true },
            take: 10001,
          })
          .then((rows) => {
            if (rows.length > 10000)
              throw new RequestError("Danh sách phiên Admin cũ quá lớn.", 503);
            return new Set(rows.map((r) => r.token));
          }),
      };
      legacyAdmins = entry;
      entry.values.catch(() => {
        if (legacyAdmins === entry) entry.expires = Date.now() + 30000;
      });
    }
    if (!(await legacyAdmins.values).has(digest(raw))) return false;
  }
  const session = await prisma.adminSession.findUnique({
    where: { token: digest(raw) },
  });
  return !!session && session.expiresAt > new Date();
}
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin)
    throw new Error("Yêu cầu từ nguồn không hợp lệ.");
}
export function failure(error: unknown) {
  if (!(error instanceof RequestError && error.status < 500))
    console.error(error);
  return NextResponse.json(
    {
      success: false,
      ...(error instanceof RequestError && error.code
        ? { errorCode: error.code }
        : {}),
      error:
        error instanceof Error &&
        (error.constructor === Error || error instanceof RequestError)
          ? error.message
          : "Không thể xử lý dữ liệu. Kiểm tra kết nối database.",
    },
    {
      status: error instanceof RequestError ? error.status : 400,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof RequestError && error.status === 429
          ? { "Retry-After": "60" }
          : {}),
      },
    },
  );
}
