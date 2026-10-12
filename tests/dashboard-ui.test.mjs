import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url),
  swc = require("next/dist/build/swc");
require.extensions[".tsx"] = (module, filename) =>
  module._compile(
    swc.transformSync(readFileSync(filename, "utf8"), {
      filename,
      jsc: {
        parser: { syntax: "typescript", tsx: true },
        target: "es2022",
        transform: { react: { runtime: "automatic" } },
      },
      module: { type: "commonjs" },
    }).code,
    filename,
  );
require.extensions[".ts"] = require.extensions[".tsx"];
let active;
const React = require("react");
require.cache[require.resolve("react")].exports = {
  ...React,
  useState(initial) {
    const h = active,
      i = h.index++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [
      h.slots[i],
      (v) => (h.slots[i] = typeof v === "function" ? v(h.slots[i]) : v),
    ];
  },
  useRef(initial) {
    const h = active,
      i = h.index++;
    return (h.slots[i] ??= { current: initial });
  },
  useEffect(effect, deps) {
    const h = active,
      i = h.index++;
    if (!h.effects[i]) {
      h.effects[i] = true;
      h.queue.push(effect);
    }
  },
};
require.cache[require.resolve("../src/lib/client.ts")] = {
  loaded: true,
  exports: { api: (...args) => active.api(...args) },
};
const Page = require("../src/app/dashboard/page.tsx").default;
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null) return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}
function fixture(page = 1, unitsPage = 1) {
  return {
    asOf: new Date().toISOString(),
    countsAsOf: new Date().toISOString(),
    page,
    pageSize: 20,
    totalPages: 3,
    totalParticipants: 45,
    unitsPage,
    unitsPageSize: 10,
    totalUnits: 26,
    unitsTotalPages: 3,
    results: Array.from({ length: page === 3 ? 5 : 20 }, (_, i) => ({
      id: "r" + page + "-" + i,
      maskedCandidateCode: "ptb098572****",
      score: 10,
      totalDurationSeconds: 65,
      userInfo: { unit: "A" },
    })),
    units: Array.from({ length: unitsPage === 3 ? 6 : 10 }, (_, i) => ({
      unit: "U" + unitsPage + "-" + i,
      participantCount: 20 - i,
    })),
  };
}
function setup() {
  const h = {
    index: 0,
    slots: [],
    effects: [],
    queue: [],
    calls: [],
    tree: null,
  };
  h.api = async (url) => {
    h.calls.push(url);
    const p = new URL("http://test" + url).searchParams;
    return fixture(Number(p.get("page")), Number(p.get("unitsPage")));
  };
  h.render = () => {
    active = h;
    h.index = 0;
    h.tree = Page();
    for (const f of h.queue.splice(0)) f();
  };
  h.flush = async () => {
    await new Promise((r) => setImmediate(r));
    h.render();
  };
  h.render();
  return h;
}
const pagination = (h, label) =>
  nodes(h.tree).find(
    (n) => n.props?.label === label && typeof n.props?.onPage === "function",
  );
test("dashboard has two tables and independent pages; mount and each action use one request", async () => {
  const h = setup();
  await h.flush();
  assert.equal(h.calls.length, 1);
  assert.equal(nodes(h.tree).filter((n) => n.type === "table").length, 2);
  assert.ok(text(h.tree).includes("ptb098572****"));
  assert.ok(!text(h.tree).includes("0985728123"));
  assert.ok(text(h.tree).includes("1 phút 5 giây"));
  pagination(h, "Phân trang thí sinh").props.onPage(2);
  await h.flush();
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1], /page=2&unitsPage=1/);
  pagination(h, "Phân trang đơn vị").props.onPage(2);
  await h.flush();
  assert.equal(h.calls.length, 3);
  assert.match(h.calls[2], /page=2&unitsPage=2/);
  assert.equal(pagination(h, "Phân trang thí sinh").props.page, 2);
  const refresh = nodes(h.tree).find(
    (n) => n.type === "button" && text(n) === "Làm mới",
  );
  refresh.props.onClick();
  await h.flush();
  assert.equal(h.calls.length, 4);
  assert.match(h.calls[3], /page=2&unitsPage=2/);
  h.render();
  await h.flush();
  assert.equal(h.calls.length, 4);
});
test("failed page change keeps previous rows and pages; in-flight requests disable navigation", async () => {
  const h = setup();
  await h.flush();
  let reject;
  h.api = (url) => {
    h.calls.push(url);
    return new Promise((_, r) => (reject = r));
  };
  pagination(h, "Phân trang thí sinh").props.onPage(2);
  h.render();
  assert.equal(pagination(h, "Phân trang thí sinh").props.busy, true);
  pagination(h, "Phân trang đơn vị").props.onPage(2);
  assert.equal(h.calls.length, 2);
  reject(new Error("offline"));
  await h.flush();
  assert.equal(pagination(h, "Phân trang thí sinh").props.page, 1);
  assert.equal(pagination(h, "Phân trang đơn vị").props.page, 1);
  assert.ok(text(h.tree).includes("Không tải được"));
  assert.ok(text(h.tree).includes("ptb098572****"));
});
test("empty exam displays empty state and a single page", async () => {
  const h = setup();
  await h.flush();
  h.api = async () => ({
    ...fixture(),
    results: [],
    totalParticipants: 0,
    totalPages: 1,
    units: [],
    totalUnits: 0,
    unitsTotalPages: 1,
  });
  nodes(h.tree)
    .find((n) => n.type === "button" && text(n) === "Làm mới")
    .props.onClick();
  await h.flush();
  assert.ok(text(h.tree).includes("Chưa có thí sinh nộp bài."));
  assert.equal(pagination(h, "Phân trang thí sinh").props.pages, 1);
});
