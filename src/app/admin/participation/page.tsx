import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import {
  getAdminParticipation,
  participationPageSize,
} from "../../../lib/admin-participation";
import { isAdmin } from "../../../lib/server";

const path = "/admin/participation";
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Ho_Chi_Minh",
});

function detailsHref(unit: string, page = 1) {
  const query = new URLSearchParams({ unit });
  if (page > 1) query.set("page", String(page));
  return `${path}?${query}#detail`;
}

export default async function AdminParticipationPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string | string[]; page?: string | string[] }>;
}) {
  if (!(await isAdmin({ cookies: await cookies() }))) redirect("/admin");

  const params = await searchParams;
  const unit = typeof params.unit === "string" ? params.unit : "";
  const requestedPage =
    typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 1000000
      ? requestedPage
      : 1;
  const { title, units, totals, results } = await getAdminParticipation(
    unit,
    page,
  );
  const selected = units.find((entry) => entry.unit === unit);
  const pageCount = Math.max(
    1,
    Math.ceil((selected?.participants ?? 0) / participationPageSize),
  );
  if (selected && page > pageCount) redirect(detailsHref(unit, pageCount));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Về trang quản trị
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Thống kê dự thi
        </h1>
        <p className="font-medium text-slate-700">{title}</p>
        <p className="text-sm text-slate-600">
          Mỗi số điện thoại được tính một lần trong kỳ thi hiện tại, theo đơn vị
          và kết quả của lượt có điểm cao nhất. Nếu bằng điểm, lấy lượt nộp mới
          hơn. Hồ sơ cũ thiếu số điện thoại được tính theo mã thí sinh.
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <dt className="text-sm text-slate-600">Đã dự thi</dt>
          <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {totals.participants}
          </dd>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <dt className="text-sm text-emerald-800">Đạt</dt>
          <dd className="mt-1 text-3xl font-bold tabular-nums text-emerald-900">
            {totals.passed}
          </dd>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <dt className="text-sm text-amber-800">Chưa đạt</dt>
          <dd className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
            {totals.participants - totals.passed}
          </dd>
        </div>
      </dl>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <h2 className="p-4 text-lg font-semibold text-slate-900">
          Số lượng theo đơn vị
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">
                  Đơn vị
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Đã dự thi
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Đạt
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Chưa đạt
                </th>
              </tr>
            </thead>
            <tbody>
              {units.map((entry) => (
                <tr key={entry.unit} className="border-t border-slate-100">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    <Link
                      href={detailsHref(entry.unit)}
                      prefetch={false}
                      className="text-brand-700 hover:underline"
                    >
                      {entry.unit}
                    </Link>
                  </th>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {entry.participants}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {entry.passed}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {entry.participants - entry.passed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="detail"
        className="scroll-mt-24 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          Danh sách đã dự thi
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form
            action={path + "#detail"}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="space-y-1">
              <label
                htmlFor="report-unit"
                className="block text-sm font-medium text-slate-700"
              >
                Đơn vị
              </label>
              <select
                id="report-unit"
                name="unit"
                required
                defaultValue={selected?.unit ?? ""}
                className="max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Chọn đơn vị
                </option>
                {units.map(({ unit: name }) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Xem danh sách
            </button>
          </form>
          {selected && selected.participants > 0 && (
            <a
              href={`/api/admin/participation/export?${new URLSearchParams({ unit })}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất Excel đơn vị
            </a>
          )}
        </div>

        {selected && (
          <p role="status" className="text-sm text-slate-700">
            <strong>{selected.unit}</strong>
            {" · "}
            {selected.participants} đã dự thi
            {" · "}
            {selected.passed} đạt
            {" · "}
            {selected.participants - selected.passed} chưa đạt
          </p>
        )}
        {unit && !selected && (
          <p role="alert" className="text-sm text-red-700">
            Không tìm thấy đơn vị này.
          </p>
        )}
        {selected && selected.participants === 0 && (
          <p className="text-sm text-slate-600">
            Đơn vị này chưa có thí sinh nộp bài.
          </p>
        )}
        {results.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Thí sinh
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Số điện thoại
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Điểm / 10
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Kết quả
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Giờ nộp bài
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-t border-slate-100">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {result.userInfo.fullName ||
                        result.userInfo.nameInitials ||
                        result.userInfo.serviceNumber ||
                        result.userInfo.candidateCode ||
                        "—"}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {result.userInfo.phone || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {result.score}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 font-medium ${result.isPassed ? "text-emerald-800" : "text-amber-800"}`}
                    >
                      {result.isPassed ? "Đạt" : "Chưa đạt"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <time dateTime={result.submittedAt}>
                        {dateFormat.format(new Date(result.submittedAt))}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected && pageCount > 1 && (
          <nav
            aria-label="Phân trang danh sách dự thi"
            className="flex items-center gap-4 text-sm"
          >
            {page > 1 && (
              <Link
                href={detailsHref(unit, page - 1)}
                prefetch={false}
                className="text-brand-700 hover:underline"
              >
                Trang trước
              </Link>
            )}
            <span className="text-slate-600">
              Trang {page} / {pageCount}
            </span>
            {page < pageCount && (
              <Link
                href={detailsHref(unit, page + 1)}
                prefetch={false}
                className="text-brand-700 hover:underline"
              >
                Trang sau
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
