import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
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
export async function isAdmin(req: NextRequest) {
  const raw = req.cookies.get("quiz_admin")?.value;
  if (!raw) return false;
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
  console.error(error);
  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error && error.constructor === Error
          ? error.message
          : "Không thể xử lý dữ liệu. Kiểm tra kết nối database.",
    },
    { status: 400 },
  );
}
