import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUnitResults } from "../../../../../lib/admin-participation";
import { createPersonalResultsSheet } from "../../../../../lib/excel";
import { isAdmin } from "../../../../../lib/server";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req)))
      return NextResponse.json(
        { error: "Cần đăng nhập admin." },
        { status: 401, headers: privateHeaders },
      );

    const unit = req.nextUrl.searchParams.get("unit");
    if (!unit)
      return NextResponse.json(
        { error: "Vui lòng chọn đơn vị cần xuất." },
        { status: 400, headers: privateHeaders },
      );

    const results = await getUnitResults(unit);
    if (results.length === 0)
      return NextResponse.json(
        { error: "Đơn vị chưa có thí sinh nộp bài trong kỳ thi hiện tại." },
        { status: 404, headers: privateHeaders },
      );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      createPersonalResultsSheet(results, "Asia/Ho_Chi_Minh"),
      "Ket_Qua_Du_Thi",
    );
    const content: ArrayBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      compression: true,
    });
    const filename = encodeURIComponent(
      `Kết quả dự thi - ${unit}.xlsx`,
    ).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new NextResponse(content, {
      headers: {
        ...privateHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Ket_Qua_Du_Thi.xlsx"; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Không thể xuất kết quả dự thi. Vui lòng thử lại." },
      { status: 500, headers: privateHeaders },
    );
  }
}
