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
require.cache[require.resolve("../src/components/useExamTab.ts")] = {
  loaded: true,
  exports: {
    useExamTab: () => ({ status: active.ownership ?? "owned", retry() {} }),
  },
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
function setup(saved = session, options = {}) {
  const h = {
    index: 0,
    slots: [],
    effects: [],
    queue: [],
    calls: [],
    tree: null,
    ownership: options.ownership ?? "owned",
  };
  const storage = new Map([
    [
      "quiz_local_attempt_v2",
      options.raw ??
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
  const events = new Map();
  const listen = (name, fn) => {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(fn);
  };
  const remove = (name, fn) => events.get(name)?.delete(fn);
  globalThis.window = { addEventListener: listen, removeEventListener: remove };
  globalThis.document = {
    hidden: false,
    hasFocus: () => h.focused !== false,
    addEventListener: listen,
    removeEventListener: remove,
  };
  h.emit = (name) => {
    for (const fn of events.get(name) ?? []) fn();
  };
  h.storage = storage;
  h.focused = true;
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
    delete globalThis.document;
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

test("service number field formats typing and paste without losing leading zeroes", async () => {
  const h = setup();
  try {
    await h.flush();
    h.api = async () => ({
      config: cfg,
      security: { enabled: false, siteKey: "" },
    });
    h.button("Làm Lượt Khác").props.onClick();
    await h.flush();
    const input = () =>
      nodes(h.tree).find((n) => n.props?.id === "service-number");
    input().props.onChange({ target: { value: "650695" } });
    h.render();
    assert.equal(input().props.value, "650-695");
    let prevented = false;
    input().props.onPaste({
      preventDefault() {
        prevented = true;
      },
      clipboardData: { getData: () => "001002" },
    });
    h.render();
    assert.equal(prevented, true);
    assert.equal(input().props.value, "001-002");
    input().props.onPaste({
      preventDefault() {},
      clipboardData: { getData: () => "123456789" },
    });
    h.render();
    assert.equal(input().props.value, "001-002");
  } finally {
    h.cleanup();
  }
});

test("leaving and returning shows a blocking overlay with zero monitoring requests", async () => {
  const h = setup({
    ...session,
    result: null,
    config: {
      ...cfg,
      monitorEnabled: true,
      maxAwaySeconds: 30,
      preventCopy: true,
    },
  });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await h.flush();
    h.focused = false;
    h.emit("blur");
    document.hidden = true;
    h.emit("visibilitychange");
    h.render();
    let saved = JSON.parse(h.storage.get("quiz_local_attempt_v2"));
    assert.equal(saved.guard.leaveCount, 1);
    assert.deepEqual(saved.guard.awayAnswers, { 1: "A" });
    assert.deepEqual(h.calls, []);
    const option = nodes(h.tree).find(
      (n) => n.type === "button" && text(n).replace(/\s/g, "") === "BB",
    );
    assert.ok(option);
    option.props.onClick();
    h.render();
    assert.deepEqual(
      JSON.parse(h.storage.get("quiz_local_attempt_v2")).session.answers,
      { 1: "A" },
    );
    now += 10000;
    h.focused = true;
    document.hidden = false;
    h.emit("focus");
    h.render();
    const overlay = nodes(h.tree).find(
      (n) => n.props?.onContinue && "ended" in n.props,
    );
    assert.ok(overlay);
    assert.equal(overlay.props.ended, null);
    overlay.props.onContinue();
    h.render();
    assert.equal(
      JSON.parse(h.storage.get("quiz_local_attempt_v2")).guard.awaySince,
      null,
    );
    assert.deepEqual(h.calls, []);
  } finally {
    h.cleanup();
    Date.now = realNow;
  }
});
test("past away limit freezes departure answers, submits once and survives reload while offline", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const h = setup({
    ...session,
    result: null,
    config: { ...cfg, monitorEnabled: true, maxAwaySeconds: 30 },
  });
  try {
    await h.flush();
    h.focused = false;
    h.emit("blur");
    h.render();
    now += 31000;
    h.focused = true;
    h.emit("focus");
    await h.flush();
    assert.deepEqual(h.calls, ["/api/exam"]);
    let saved = JSON.parse(h.storage.get("quiz_local_attempt_v2"));
    assert.equal(saved.guard.endedReason, "away");
    assert.deepEqual(saved.frozen, { 1: "A" });
    const raw = h.storage.get("quiz_local_attempt_v2");
    h.cleanup();
    const restored = setup(session, { raw });
    try {
      await restored.flush();
      assert.deepEqual(restored.calls, ["/api/exam"]);
      assert.deepEqual(
        JSON.parse(restored.storage.get("quiz_local_attempt_v2")).frozen,
        { 1: "A" },
      );
      assert.ok(nodes(restored.tree).some((n) => n.props?.ended === "away"));
    } finally {
      restored.cleanup();
    }
  } finally {
    Date.now = realNow;
  }
});
test("bad local snapshot is backed up and offers recovery instead of reloading forever", async () => {
  const h = setup(session, { raw: "{broken" });
  try {
    await h.flush();
    assert.ok(text(h.tree).includes("Bản lưu trên máy bị lỗi"));
    assert.equal(h.storage.has("quiz_local_attempt_v2"), false);
    assert.ok([...h.storage.values()].includes("{broken"));
    assert.deepEqual(h.calls, ["/api/config"]);
    assert.ok(h.button("Đặt lại"));
  } finally {
    h.cleanup();
  }
});
test("secondary tab cannot write, restore or call exam API", async () => {
  const h = setup({ ...session, result: null }, { ownership: "blocked" });
  try {
    const before = h.storage.get("quiz_local_attempt_v2");
    await h.flush();
    assert.ok(text(h.tree).includes("tab khác"));
    assert.deepEqual(h.calls, []);
    assert.equal(h.storage.get("quiz_local_attempt_v2"), before);
  } finally {
    h.cleanup();
  }
});
test("copy prevention is scoped to question panel and does not terminate attempt", async () => {
  const h = setup({
    ...session,
    result: null,
    config: { ...cfg, preventCopy: true },
  });
  try {
    await h.flush();
    const panel = nodes(h.tree).find((n) => n.props?.onCopy);
    assert.ok(panel);
    let prevented = false;
    panel.props.onCopy({
      preventDefault() {
        prevented = true;
      },
    });
    h.render();
    assert.equal(prevented, true);
    assert.equal(
      JSON.parse(h.storage.get("quiz_local_attempt_v2")).guard.endedReason,
      null,
    );
    assert.deepEqual(h.calls, []);
  } finally {
    h.cleanup();
  }
});

test("manual submission appears only on final question with every answer selected", async () => {
  const questions = [session.questions[0], { ...session.questions[0], id: 2 }];
  for (const [answers, currentIndex, visible] of [
    [{}, 0, false],
    [{ 1: "A" }, 1, false],
    [{ 1: "A", 2: "B" }, 0, false],
    [{ 1: "A", 2: "B" }, 1, true],
  ]) {
    const h = setup({
      ...session,
      result: null,
      config: { ...cfg, questionCount: 2 },
      questions,
      answers,
      currentIndex,
    });
    try {
      await h.flush();
      const buttons = nodes(h.tree).filter(
        (n) => n.type === "button" && text(n) === "Nộp Bài",
      );
      assert.equal(buttons.length, visible ? 1 : 0);
      if (visible) {
        const row = nodes(h.tree).find((n) =>
          n.props?.children?.includes?.(buttons[0]),
        );
        assert.ok(text(row).includes("Câu trước"));
        assert.equal(h.button("Câu sau"), undefined);
      }
      assert.deepEqual(h.calls, []);
    } finally {
      h.cleanup();
    }
  }
});

test("end-session button stays visible; cancelling confirmation preserves the attempt without requests", async () => {
  const h = setup({ ...session, result: null, answers: {} });
  try {
    await h.flush();
    const before = h.storage.get("quiz_local_attempt_v2");
    assert.ok(h.button("Kết thúc phiên thi"));
    assert.equal(h.button("Nộp Bài"), undefined);
    h.button("Kết thúc phiên thi").props.onClick();
    h.render();
    assert.ok(h.button("Xác nhận kết thúc và thi lại"));
    h.button("Tiếp tục làm bài").props.onClick();
    h.render();
    assert.equal(h.button("Xác nhận kết thúc và thi lại"), undefined);
    assert.equal(h.storage.get("quiz_local_attempt_v2"), before);
    assert.deepEqual(h.calls, []);
  } finally {
    h.cleanup();
  }
});

test("confirm end discards only the local active attempt, returns to registration and reloads verification", async () => {
  const h = setup({ ...session, result: null, answers: {} });
  try {
    await h.flush();
    h.api = async (url) => {
      h.calls.push(url);
      return {
        config: cfg,
        security: { enabled: true, siteKey: "new-site-key" },
      };
    };
    h.button("Kết thúc phiên thi").props.onClick();
    h.render();
    h.button("Xác nhận kết thúc và thi lại").props.onClick();
    await h.flush();
    assert.equal(h.storage.has("quiz_local_attempt_v2"), false);
    assert.equal(h.storage.has("quiz_active_attempt"), false);
    assert.deepEqual(h.calls, ["/api/config"]);
    assert.equal(h.button("Kết thúc phiên thi"), undefined);
    assert.equal(h.button("Bắt Đầu").props.disabled, true);
    const input = nodes(h.tree).find((n) => n.props?.id === "service-number");
    assert.equal(input.props.value, "649-605");
    const widget = nodes(h.tree).find((n) => n.type === Verification);
    assert.equal(widget.props.siteKey, "new-site-key");
    h.emit("online");
    await h.flush();
    assert.deepEqual(h.calls, ["/api/config"]);
  } finally {
    h.cleanup();
  }
});

test("end-session cannot discard a pending submission", async () => {
  const h = setup({ ...session, result: null });
  const previousConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  try {
    await h.flush();
    let resolve;
    h.api = (url) => {
      h.calls.push(url);
      return new Promise((r) => {
        resolve = r;
      });
    };
    h.button("Kết thúc phiên thi").props.onClick();
    h.render();
    h.button("Nộp Bài").props.onClick();
    h.render();
    assert.equal(h.button("Kết thúc phiên thi").props.disabled, true);
    assert.equal(h.button("Xác nhận kết thúc và thi lại").props.disabled, true);
    h.button("Xác nhận kết thúc và thi lại").props.onClick();
    assert.ok(h.storage.has("quiz_local_attempt_v2"));
    assert.deepEqual(h.calls, ["/api/exam"]);
    resolve(session);
    await h.flush();
    assert.ok(h.button("Làm Lượt Khác"));
  } finally {
    globalThis.confirm = previousConfirm;
    h.cleanup();
  }
});
