import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
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
const React = require("react");
let active;
require.cache[require.resolve("react")].exports = {
  ...React,
  useState(initial) {
    const h = active;
    const i = h.index++;
    if (!(i in h.slots))
      h.slots[i] = typeof initial === "function" ? initial() : initial;
    return [
      h.slots[i],
      (value) => {
        h.slots[i] = typeof value === "function" ? value(h.slots[i]) : value;
      },
    ];
  },
  useRef(initial) {
    const h = active;
    const i = h.index++;
    return (h.slots[i] ??= { current: initial });
  },
  useEffect(effect, deps) {
    const h = active;
    const i = h.index++;
    const previous = h.effects[i];
    if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j])))
      h.queue.push(() => {
        previous?.cleanup?.();
        h.effects[i] = { deps, cleanup: effect() };
      });
  },
};
function Verification() {}
require.cache[require.resolve("../src/components/Verification.tsx")] = {
  loaded: true,
  exports: { __esModule: true, default: Verification },
};
require.cache[require.resolve("../src/lib/client.ts")] = {
  loaded: true,
  exports: { api: (...args) => active.api(...args) },
};
const Page = require("../src/app/page.tsx").default;
const cfg = {
  title: "Test",
  description: "",
  questionCount: 1,
  totalTimeMinutes: 10,
  passingScorePercent: 80,
  allowReview: false,
  isOpen: true,
  units: [{ name: "A", targetCount: 0 }],
};
const session = {
  userInfo: { serviceNumber: "649-605", candidateCode: "649-605", unit: "A" },
  config: cfg,
  questions: [
    { id: 1, question: "Q", options: { A: "A", B: "B", C: "", D: "" } },
  ],
  answers: { 1: "A" },
  currentIndex: 0,
  serverTime: Date.now(),
  deadline: new Date(Date.now() + 600000).toISOString(),
  result: {
    userInfo: { serviceNumber: "649-605", unit: "A" },
    isPassed: true,
    score: 10,
    correctCount: 1,
    totalQuestions: 1,
    percentage: 100,
    totalDurationSeconds: 2,
  },
};
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
function setup(saved = session) {
  const h = {
    index: 0,
    slots: [],
    effects: [],
    queue: [],
    calls: [],
    tree: null,
  };
  const storage = new Map([
    [
      "quiz_local_attempt_v2",
      JSON.stringify({
        token: "a".repeat(64),
        session: saved,
        offset: 0,
        frozen: null,
      }),
    ],
  ]);
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  h.api = (url) => {
    h.calls.push(url);
    throw new Error("offline");
  };
  h.render = () => {
    active = h;
    h.index = 0;
    h.tree = Page();
    for (const effect of h.queue.splice(0)) effect();
    return nodes(h.tree);
  };
  h.flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return h.render();
  };
  h.cleanup = () => {
    for (const e of h.effects) e?.cleanup?.();
    delete globalThis.localStorage;
    delete globalThis.window;
  };
  h.button = (label) =>
    nodes(h.tree).find((n) => n.type === "button" && text(n).includes(label));
  h.render();
  return h;
}
test("reload completed attempt then retake waits for fresh security and requires a token", async () => {
  const h = setup();
  try {
    await h.flush();
    assert.equal(h.calls.length, 0);
    let resolve;
    h.api = (url) => {
      h.calls.push(url);
      return new Promise((r) => (resolve = r));
    };
    h.button("Làm Lượt Khác").props.onClick();
    h.render();
    assert.equal(h.button("Bắt Đầu").props.disabled, true);
    const form = nodes(h.tree).find((n) => n.type === "form");
    await form.props.onSubmit({ preventDefault() {} });
    assert.deepEqual(h.calls, ["/api/config"]);
    resolve({ config: cfg, security: { enabled: true, siteKey: "site-key" } });
    await h.flush();
    const widget = nodes(h.tree).find((n) => n.type === Verification);
    assert.ok(widget);
    assert.equal(widget.props.siteKey, "site-key");
    assert.equal(h.button("Bắt Đầu").props.disabled, true);
    widget.props.onToken("fresh-token");
    h.render();
    assert.equal(h.button("Bắt Đầu").props.disabled, false);
  } finally {
    h.cleanup();
  }
});
test("failed registration config stays blocked, retry loads disabled verification explicitly", async () => {
  const h = setup();
  try {
    await h.flush();
    h.button("Làm Lượt Khác").props.onClick();
    await h.flush();
    assert.equal(h.button("Bắt Đầu").props.disabled, true);
    assert.ok(h.button("Tải lại cấu hình"));
    h.api = async (url) => {
      h.calls.push(url);
      return { config: cfg, security: { enabled: false, siteKey: "" } };
    };
    h.button("Tải lại cấu hình").props.onClick();
    await h.flush();
    assert.equal(h.button("Bắt Đầu").props.disabled, false);
    assert.equal(
      nodes(h.tree).filter((n) => n.type === Verification).length,
      0,
    );
  } finally {
    h.cleanup();
  }
});
test("missing security in response cannot silently bypass verification", async () => {
  const h = setup();
  try {
    await h.flush();
    h.api = async () => ({ config: cfg });
    h.button("Làm Lượt Khác").props.onClick();
    await h.flush();
    assert.equal(h.button("Bắt Đầu").props.disabled, true);
    assert.ok(h.button("Tải lại cấu hình"));
  } finally {
    h.cleanup();
  }
});
test("offline active attempt restores without loading registration config", async () => {
  const h = setup({ ...session, result: null });
  try {
    await h.flush();
    assert.deepEqual(h.calls, []);
    assert.ok(text(h.tree).includes("649-605"));
    assert.ok(!h.button("Bắt Đầu"));
  } finally {
    h.cleanup();
  }
});
