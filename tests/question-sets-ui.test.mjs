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
let active, parse;
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
};
require.cache[require.resolve("../src/lib/excel.ts")] = {
  exports: { parseExcelQuestions: (...args) => parse(...args) },
};
const Editor = require("../src/components/QuestionSetsEditor.tsx").default;
function nodes(tree) {
  return tree == null || typeof tree !== "object"
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  return tree == null
    ? ""
    : typeof tree !== "object"
      ? String(tree)
      : Array.isArray(tree)
        ? tree.map(text).join("")
        : text(tree.props?.children);
}
const q = (id, setId) => ({
  id,
  setId,
  question: "Q",
  options: { A: "A", B: "B", C: "C", D: "D" },
  correct: "A",
});
function setup() {
  const h = {
    index: 0,
    slots: [],
    busy: false,
    changes: 0,
    props: {
      sets: [{ id: "one", name: "Bộ 1", questionCount: 2 }],
      questions: [q(1, "one"), q(2, "one")],
      questionCount: 2,
      disabled: false,
    },
  };
  h.props.onChange = (sets, questions) => {
    h.props = { ...h.props, sets, questions };
    h.changes++;
  };
  h.props.onBusyChange = (v) => (h.busy = v);
  h.render = () => {
    active = h;
    h.index = 0;
    h.tree = Editor(h.props);
  };
  h.flush = async () => {
    await new Promise((r) => setImmediate(r));
    h.render();
  };
  h.get = (name) => nodes(h.tree).find((n) => n.props?.["aria-label"] === name);
  h.render();
  return h;
}
test("Admin adds sets, imports only the selected file and blocks mismatched quotas", async () => {
  const h = setup();
  nodes(h.tree)
    .find((n) => n.type === "button" && text(n).includes("Thêm bộ"))
    .props.onClick();
  h.render();
  assert.equal(h.props.sets.length, 2);
  assert.equal(h.props.sets[1].questionCount, 0);
  assert.ok(!nodes(h.tree).some((n) => n.props?.role === "alert"));
  parse = async () => [q(1), q(2), q(3)];
  const input = { files: [{ size: 100 }], value: "file.xlsx" };
  h.get("Nạp Excel cho Bộ 2").props.onChange({ currentTarget: input });
  await h.flush();
  assert.equal(h.props.questions.length, 5);
  assert.deepEqual(
    h.props.questions.filter((q) => q.setId === "one").map((q) => q.id),
    [1, 2],
  );
  assert.equal(new Set(h.props.questions.map((q) => q.id)).size, 5);
  assert.equal(input.value, "");
  h.get("Số câu lấy từ Bộ 2").props.onChange({ target: { value: "1" } });
  h.render();
  assert.ok(
    nodes(h.tree).some(
      (n) => n.props?.role === "alert" && text(n).includes("Tổng số câu"),
    ),
  );
  h.get("Số câu lấy từ Bộ 1").props.onChange({ target: { value: "1" } });
  h.render();
  assert.ok(!nodes(h.tree).some((n) => n.props?.role === "alert"));
  assert.ok(text(h.tree).includes("Đã phân bổ 2/2"));
});
test("failed import leaves all banks intact, and pending import retains latest total without racing a second upload", async () => {
  const h = setup(),
    original = structuredClone(h.props.questions);
  parse = async () => {
    throw new Error("File lỗi");
  };
  h.get("Nạp Excel cho Bộ 1").props.onChange({
    currentTarget: { files: [{ size: 100 }], value: "broken.xlsx" },
  });
  await h.flush();
  assert.deepEqual(h.props.questions, original);
  assert.equal(h.busy, false);
  assert.ok(text(h.tree).includes("File lỗi"));
  let release,
    reads = 0;
  parse = () => {
    reads++;
    return new Promise((resolve) => (release = resolve));
  };
  const field = h.get("Nạp Excel cho Bộ 1");
  field.props.onChange({
    currentTarget: { files: [{ size: 100 }], value: "one.xlsx" },
  });
  h.render();
  assert.equal(h.busy, true);
  assert.equal(
    nodes(h.tree).find((n) => n.type === "fieldset").props.disabled,
    true,
  );
  field.props.onChange({
    currentTarget: { files: [{ size: 100 }], value: "two.xlsx" },
  });
  assert.equal(reads, 1);
  h.props = { ...h.props, questionCount: 5 };
  h.render();
  release([q(1), q(2), q(3)]);
  await h.flush();
  assert.equal(h.props.questionCount, 5);
  assert.equal(h.props.questions.length, 3);
  assert.equal(h.busy, false);
});
test("removing a set deletes only that draft and asks for confirmation; final set remains", () => {
  const h = setup();
  assert.equal(h.get("Xóa Bộ 1").props.disabled, true);
  h.props = {
    ...h.props,
    sets: [...h.props.sets, { id: "two", name: "Chương 2", questionCount: 0 }],
    questions: [...h.props.questions, q(3, "two")],
  };
  h.render();
  const previous = globalThis.confirm;
  try {
    globalThis.confirm = () => false;
    h.get("Xóa Chương 2").props.onClick();
    assert.equal(h.props.sets.length, 2);
    globalThis.confirm = () => true;
    h.get("Xóa Chương 2").props.onClick();
    h.render();
    assert.equal(h.props.sets.length, 1);
    assert.deepEqual(
      h.props.questions.map((q) => q.id),
      [1, 2],
    );
  } finally {
    globalThis.confirm = previous;
  }
});
