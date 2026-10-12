import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import {
  checkOrigin,
  failure,
  isAdmin,
  settings,
  token,
  verifyPassword,
} from "../../../../lib/server";
import {
  readLimitedJson,
  RequestError,
} from "../../../../lib/request-security";
import type { ExamConfig } from "../../../../types/quiz";

const headers = { "Cache-Control": "private, no-store" };
// A bounded page avoids sending thousands of attempts in one Vercel response.
export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req)))
      throw new RequestError("Cần đăng nhập admin.", 401);
    const kind = req.nextUrl.searchParams.get("kind");
    const cursor = req.nextUrl.searchParams.get("cursor") || "";
    if (cursor.length > 200) throw new RequestError("Trang không hợp lệ.", 400);
    const s = await settings();
    const epoch = req.nextUrl.searchParams.get("examId");
    if (epoch && epoch !== s.activeExamId)
      throw new RequestError(
        "Kỳ thi đã thay đổi trong lúc xuất. Vui lòng xuất lại.",
        409,
      );
    const query = {
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: "asc" as const },
      take: 101,
    };
    const records =
      kind === "attempts"
        ? await prisma.attempt.findMany(query)
        : kind === "legacy"
          ? await prisma.examResult.findMany(query)
          : kind === "candidates"
            ? await prisma.candidate.findMany(query)
            : kind === "banks"
              ? await prisma.questionBank.findMany(query)
              : null;
    if (!records) throw new RequestError("Loại dữ liệu không hợp lệ.", 400);
    const page: Array<(typeof records)[number]> = [];
    const exportSettings = kind === "attempts" && !cursor ? s : undefined;
    let bytes = exportSettings
      ? Buffer.byteLength(JSON.stringify(exportSettings))
      : 0;
    if (bytes > 3 * 1024 * 1024)
      throw new RequestError(
        "Cấu hình quá lớn để xuất qua web. Hãy sao lưu trực tiếp database.",
        413,
      );
    for (const record of records.slice(0, 100)) {
      const size = Buffer.byteLength(JSON.stringify(record));
      if (bytes + size > 3 * 1024 * 1024) {
        if (!page.length)
          throw new RequestError(
            "Một bản ghi quá lớn để xuất qua web. Hãy sao lưu trực tiếp database.",
            413,
          );
        break;
      }
      page.push(record);
      bytes += size;
    }
    return NextResponse.json(
      {
        success: true,
        records: page,
        examId: s.activeExamId,
        settings: exportSettings,
        nextCursor: records.length > page.length ? page.at(-1)?.id : null,
      },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    checkOrigin(req);
    if (!(await isAdmin(req)))
      throw new RequestError("Cần đăng nhập admin.", 401);
    const body = await readLimitedJson(req, 4096);
    if (
      body.confirmation !== "DELETE_ALL_EXAM_DATA" ||
      typeof body.password !== "string" ||
      body.password.length > 200
    )
      throw new RequestError("Vui lòng xác nhận và nhập mật khẩu Admin.", 400);
    const account = await prisma.adminAccount.findUnique({
      where: { id: "main" },
    });
    if (!account || !verifyPassword(body.password, account.passwordHash))
      throw new RequestError(
        "Mật khẩu Admin không đúng. Chưa xóa dữ liệu.",
        401,
      );
    await settings();
    const deleted = await prisma.$transaction(async (tx) => {
      const [s] = await tx.$queryRaw<{ config: ExamConfig }[]>`
        SELECT "config" FROM "QuizSettings" WHERE "id" = 'main' FOR UPDATE`;
      await tx.quizSettings.update({
        where: { id: "main" },
        data: {
          activeExamId: token(),
          config: JSON.parse(JSON.stringify({ ...s.config, isOpen: false })),
        },
      });
      const attempts = await tx.attempt.deleteMany({});
      const legacy = await tx.examResult.deleteMany({});
      return { attempts: attempts.count, legacy: legacy.count };
    });
    revalidateTag("quiz-leaderboard", { expire: 0 });
    revalidateTag("quiz-config", { expire: 0 });
    revalidatePath("/api/results");
    revalidatePath("/api/config");
    return NextResponse.json({ success: true, deleted }, { headers });
  } catch (e) {
    return failure(e);
  }
}
