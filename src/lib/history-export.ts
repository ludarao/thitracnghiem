/** Read every submitted-attempt page without changing the visible history page. */
export async function collectSubmittedHistory<T>(
  readPage: (
    url: string,
  ) => Promise<{ history: T[]; nextCursor: string | null }>,
  onProgress: (count: number) => void,
): Promise<T[]> {
  const rows: T[] = [];
  const cursors = new Set<string>();
  let cursor = "";
  do {
    if (cursors.has(cursor))
      throw new Error("Không thể đọc trang tiếp theo. Vui lòng xuất lại.");
    cursors.add(cursor);
    const page = await readPage(
      "/api/results?history=1&cursor=" + encodeURIComponent(cursor),
    );
    rows.push(...page.history);
    onProgress(rows.length);
    cursor = page.nextCursor || "";
  } while (cursor);
  return rows;
}
