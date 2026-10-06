import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  token,
  digest,
  hashPassword,
  verifyPassword,
  isAdmin,
  checkOrigin,
  failure,
} from "../../../lib/server";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ authenticated: await isAdmin(req) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const { password } = await req.json();
    if (typeof password !== "string" || password.length > 200)
      throw new Error("Mật khẩu không hợp lệ.");
    let account = await prisma.adminAccount.findUnique({
      where: { id: "main" },
    });
    if (!account) {
      const initial = process.env.ADMIN_PASSWORD;
      if (!initial || initial.length < 10)
        throw new Error(
          "Cần cấu hình ADMIN_PASSWORD tối thiểu 10 ký tự trên server.",
        );
      account = await prisma.adminAccount.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main", passwordHash: hashPassword(initial) },
      });
    }
    if (account.lockedUntil && account.lockedUntil > new Date())
      return NextResponse.json(
        { error: "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút." },
        { status: 429 },
      );
    if (account.lockedUntil) {
      account = await prisma.adminAccount.update({
        where: { id: "main" },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }
    if (!verifyPassword(password, account.passwordHash)) {
      const failed = await prisma.adminAccount.update({
        where: { id: "main" },
        data: { failedAttempts: { increment: 1 } },
      });
      if (failed.failedAttempts >= 5)
        await prisma.adminAccount.update({
          where: { id: "main" },
          data: { lockedUntil: new Date(Date.now() + 15 * 60000) },
        });
      return NextResponse.json(
        { error: "Mật khẩu không chính xác." },
        { status: 401 },
      );
    }
    await prisma.adminAccount.update({
      where: { id: "main" },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const raw = token();
    await prisma.adminSession.create({
      data: {
        token: digest(raw),
        expiresAt: new Date(Date.now() + 8 * 3600000),
      },
    });
    const res = NextResponse.json({ success: true });
    res.cookies.set("quiz_admin", raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 3600,
      path: "/",
    });
    return res;
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: NextRequest) {
  try {
    checkOrigin(req);
    if (!(await isAdmin(req)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { password } = await req.json();
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 200
    )
      throw new Error("Mật khẩu phải có từ 10 đến 200 ký tự.");
    await prisma.$transaction([
      prisma.adminAccount.update({
        where: { id: "main" },
        data: {
          passwordHash: hashPassword(password),
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.adminSession.deleteMany({}),
    ]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    checkOrigin(req);
    const raw = req.cookies.get("quiz_admin")?.value;
    if (raw)
      await prisma.adminSession.deleteMany({ where: { token: digest(raw) } });
    const res = NextResponse.json({ success: true });
    res.cookies.set("quiz_admin", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    return failure(e);
  }
}
