import test from "node:test";
import assert from "node:assert/strict";
import { collectSubmittedHistory } from "../src/lib/history-export.ts";

test("Excel export walks all history pages sequentially including repeated candidates", async () => {
  const all = Array.from({ length: 5000 }, (_, id) => ({
    id,
    candidate: "same",
    examId: id % 2,
  }));
  let requests = 0;
  const progress = [];
  const rows = await collectSubmittedHistory(
    async (url) => {
      const cursor = new URL(url, "http://local").searchParams.get("cursor");
      const offset = Number(cursor || 0);
      requests++;
      return {
        history: all.slice(offset, offset + 50),
        nextCursor: offset + 50 < all.length ? String(offset + 50) : null,
      };
    },
    (count) => progress.push(count),
  );
  assert.deepEqual(rows, all);
  assert.equal(requests, 100);
  assert.equal(progress.at(-1), 5000);
});

test("export rejects failed pages instead of returning an incomplete file", async () => {
  let requests = 0;
  await assert.rejects(
    collectSubmittedHistory(
      async () => {
        if (requests++) throw new Error("Session expired");
        return { history: [{ id: 1 }], nextCursor: "next" };
      },
      () => {},
    ),
    /Session expired/,
  );
});

test("empty history terminates and repeating cursors cannot loop forever", async () => {
  assert.deepEqual(
    await collectSubmittedHistory(
      async () => ({ history: [], nextCursor: null }),
      () => {},
    ),
    [],
  );
  await assert.rejects(
    collectSubmittedHistory(
      async () => ({ history: [], nextCursor: "same" }),
      () => {},
    ),
    /trang tiếp theo/,
  );
});
