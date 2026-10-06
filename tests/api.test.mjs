import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Exercise the actual route handlers and crypto/session helpers with an isolated
// in-memory Prisma double. This checks API contracts; it does not replace a
// PostgreSQL integration test for transaction isolation or migrations.
const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    swc.transformSync(readFileSync(filename, "utf8"), {
      filename,
      jsc: { parser: { syntax: "typescript" }, target: "es2022" },
      module: { type: "commonjs" },
    }).code,
    filename,
  );
const { NextRequest } = require("next/server");
const { DEFAULT_CONFIG } = require("../src/lib/storage.ts");
let config, candidates, attempts, account, sessions, sequence;
function reset() {
  config = {
    id: "main",
    activeExamId: "exam-1",
    config: {
      ...DEFAULT_CONFIG,
      questionCount: 2,
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        id: 1,
        question: "Q1",
        options: { A: "A", B: "B", C: "C", D: "D" },
        correct: "A",
      },
      {
        id: 2,
        question: "Q2",
        options: { A: "A", B: "B", C: "C", D: "D" },
        correct: "B",
      },
    ],
  };
  candidates = new Map();
  attempts = new Map();
  sessions = new Map();
  account = null;
  sequence = 0;
}
const db = {
  quizSettings: {
    upsert: async () => config,
    update: async ({ data }) => (config = { ...config, ...data }),
  },
  candidate: {
    upsert: async ({ where, create }) => {
      if (!candidates.has(where.phone))
        candidates.set(where.phone, {
          id: "candidate-" + ++sequence,
          ...create,
        });
      return candidates.get(where.phone);
    },
  },
  attempt: {
    create: async ({ data }) => {
      const a = {
        id: "attempt-" + ++sequence,
        currentIndex: 0,
        submittedAt: null,
        result: null,
        version: 0,
        ...data,
      };
      attempts.set(a.id, a);
      return a;
    },
    findUnique: async ({ where }) =>
      where.id
        ? attempts.get(where.id)
        : [...attempts.values()].find((a) => a.token === where.token),
    update: async ({ where, data }) => {
      const a = attempts.get(where.id);
      Object.assign(a, data, { version: a.version + 1 });
      return a;
    },
    findMany: async ({ where, take }) =>
      [...attempts.values()]
        .filter(
          (a) =>
            (!where.examId || a.examId === where.examId) &&
            (where.submittedAt === null
              ? a.submittedAt === null
              : a.submittedAt !== null),
        )
        .sort(
          (a, b) =>
            (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0),
        )
        .slice(0, take),
  },
  adminAccount: {
    findUnique: async () => account,
    upsert: async ({ create }) =>
      (account ||= { ...create, failedAttempts: 0, lockedUntil: null }),
    update: async ({ data }) => {
      const { failedAttempts, ...rest } = data;
      Object.assign(account, rest);
      if (failedAttempts !== undefined)
        account.failedAttempts =
          typeof failedAttempts === "number"
            ? failedAttempts
            : account.failedAttempts + failedAttempts.increment;
      return account;
    },
  },
  adminSession: {
    findUnique: async ({ where }) => sessions.get(where.token),
    create: async ({ data }) => {
      sessions.set(data.token, data);
      return data;
    },
    deleteMany: async ({ where } = {}) => {
      if (where) sessions.delete(where.token);
      else sessions.clear();
      return { count: 1 };
    },
  },
  $transaction: async (callback) =>
    typeof callback === "function" ? callback(db) : Promise.all(callback),
};
const prismaPath = resolve("src/lib/prisma.ts");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: db },
};
const exam = require("../src/app/api/exam/route.ts");
const admin = require("../src/app/api/admin/route.ts");
const settings = require("../src/app/api/config/route.ts");
const results = require("../src/app/api/results/route.ts");
const userInfo = {
  fullName: "Nguyễn Văn An",
  phone: "0912345678",
  rank: "Đoàn viên",
  position: "Cán bộ",
  unit: DEFAULT_CONFIG.units[0].name,
};
function req(path, method = "GET", body, headers = {}) {
  return new NextRequest("http://localhost:3000" + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function start(info = userInfo) {
  const response = await exam.POST(
    req("/api/exam", "POST", { userInfo: info }),
  );
  assert.equal(response.status, 200);
  return response.json();
}
function bearer(token) {
  return { Authorization: "Bearer " + token };
}
async function action(token, body) {
  return exam.PATCH(req("/api/exam", "PATCH", body, bearer(token)));
}
async function expectedError(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}
async function login() {
  process.env.ADMIN_PASSWORD = "test-admin-password-2026";
  const response = await admin.POST(
    req("/api/admin", "POST", { password: process.env.ADMIN_PASSWORD }),
  );
  assert.equal(response.status, 200);
  return { Cookie: response.headers.get("set-cookie").split(";")[0] };
}

test("API hồ sơ: cùng số điện thoại dùng cùng hồ sơ/mã, tên khác bị từ chối", async () => {
  reset();
  const first = await start();
  const second = await start({ ...userInfo, phone: "+84 912 345 678" });
  assert.equal(first.candidateCode, "NVA0912345678");
  assert.equal(second.candidateCode, first.candidateCode);
  assert.equal(candidates.size, 1);
  const response = await expectedError(() =>
    exam.POST(
      req("/api/exam", "POST", {
        userInfo: { ...userInfo, fullName: "Tên Khác" },
      }),
    ),
  );
  assert.equal(response.status, 400);
});
test("API lượt thi: không lộ đáp án đúng, chấm server và nộp trùng không đổi kết quả", async () => {
  reset();
  const { token } = await start();
  let response = await exam.GET(
    req("/api/exam", "GET", undefined, bearer(token)),
  );
  let data = await response.json();
  assert.ok(data.questions.every((q) => !("correct" in q)));
  await action(token, { action: "answer", questionId: 1, option: "A" });
  response = await action(token, { action: "submit", score: 10 });
  data = await response.json();
  assert.equal(data.result.score, 5);
  const submitted = data.result.submittedAt;
  response = await action(token, { action: "submit" });
  data = await response.json();
  assert.equal(data.result.submittedAt, submitted);
  assert.equal(attempts.size, 1);
});
test("API bảng xếp hạng: lấy điểm lượt cuối thấp hơn, ẩn điện thoại/mã trên bảng công khai", async () => {
  reset();
  let first = await start();
  await action(first.token, { action: "answer", questionId: 1, option: "A" });
  await action(first.token, { action: "answer", questionId: 2, option: "B" });
  await action(first.token, { action: "submit" });
  await new Promise((r) => setTimeout(r, 2));
  const second = await start();
  await action(second.token, { action: "submit" });
  const data = await (await results.GET(req("/api/results"))).json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].score, 0);
  assert.equal(data.totalAttempts, 2);
  assert.ok(!("phone" in data.results[0].userInfo));
  assert.ok(!("candidateCode" in data.results[0].userInfo));
});
test("API quản trị: chặn lưu cấu hình, mở kỳ mới và đọc lịch sử khi chưa đăng nhập", async () => {
  reset();
  assert.equal(
    (await settings.PUT(req("/api/config", "PUT", { config: config.config })))
      .status,
    401,
  );
  assert.equal(
    (await results.DELETE(req("/api/results", "DELETE"))).status,
    401,
  );
  assert.equal((await results.GET(req("/api/results?history=1"))).status, 401);
});
test("API phiên admin: cookie HttpOnly, đổi mật khẩu hủy phiên và mật khẩu cũ không dùng được", async () => {
  reset();
  const headers = await login();
  assert.equal(
    (await admin.GET(req("/api/admin", "GET", undefined, headers))).status,
    200,
  );
  assert.equal(
    (
      await (
        await admin.GET(req("/api/admin", "GET", undefined, headers))
      ).json()
    ).authenticated,
    true,
  );
  await admin.PUT(
    req("/api/admin", "PUT", { password: "new-test-password-2026" }, headers),
  );
  assert.equal(sessions.size, 0);
  assert.equal(
    (
      await admin.POST(
        req("/api/admin", "POST", { password: "test-admin-password-2026" }),
      )
    ).status,
    401,
  );
});
test("API cấu hình: admin lưu dữ liệu chung, nhập câu sai không làm mất ngân hàng", async () => {
  reset();
  const headers = await login();
  const saved = await settings.PUT(
    req(
      "/api/config",
      "PUT",
      { config: { ...config.config, title: "Kỳ thi mới" } },
      headers,
    ),
  );
  assert.equal(saved.status, 200);
  assert.equal(
    (await (await settings.GET(req("/api/config"))).json()).config.title,
    "Kỳ thi mới",
  );
  const invalid = await expectedError(() =>
    settings.PUT(
      req(
        "/api/config",
        "PUT",
        {
          config: config.config,
          questions: [{ ...config.questions[0], correct: "X" }],
        },
        headers,
      ),
    ),
  );
  assert.equal(invalid.status, 400);
  assert.equal(config.questions.length, 2);
});
test("API kỳ mới: giữ lịch sử, bảng kỳ mới rỗng, chỉ admin xem được điện thoại trong lịch sử", async () => {
  reset();
  const { token } = await start();
  await action(token, { action: "submit" });
  const headers = await login();
  await results.DELETE(req("/api/results", "DELETE", undefined, headers));
  assert.equal(attempts.size, 1);
  const publicData = await (await results.GET(req("/api/results"))).json();
  assert.equal(publicData.results.length, 0);
  const history = await (
    await results.GET(req("/api/results?history=1", "GET", undefined, headers))
  ).json();
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].userInfo.phone, userInfo.phone);
});
test("API hết giờ: dashboard chốt lượt bỏ dở, lấy hạn giờ làm thời điểm nộp", async () => {
  reset();
  const { id } = await start();
  const a = attempts.get(id);
  a.deadline = new Date(Date.now() - 1000);
  const deadline = a.deadline.toISOString();
  const data = await (await results.GET(req("/api/results"))).json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].submittedAt, deadline);
});
test("API nguồn yêu cầu: chặn thao tác từ origin khác và token giả", async () => {
  reset();
  const response = await expectedError(() =>
    exam.POST(
      req(
        "/api/exam",
        "POST",
        { userInfo },
        { Origin: "https://other.example" },
      ),
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(candidates.size, 0);
  assert.equal((await exam.GET(req("/api/exam"))).status, 401);
  assert.equal(
    (
      await expectedError(() =>
        exam.GET(req("/api/exam", "GET", undefined, bearer("fake"))),
      )
    ).status,
    400,
  );
});

test("API khóa câu: đáp án muộn bị bỏ qua, câu đã khóa không còn nội dung để quay lại", async () => {
  reset();
  config.config.timePerQuestionSeconds = 10;
  const { id, token } = await start();
  const a = attempts.get(id);
  a.questionStartedAt = new Date(Date.now() - 11000);
  const response = await action(token, {
    action: "answer",
    questionId: 1,
    option: "A",
  });
  const data = await response.json();
  assert.equal(data.currentIndex, 1);
  assert.ok(!data.answers["1"]);
  assert.equal(data.questions[0].question, "");
  assert.equal(data.questions[1].question, "Q2");
  const deadline = data.questionDeadline;
  const synced = await (await action(token, { action: "sync" })).json();
  assert.equal(synced.questionDeadline, deadline);
});
test("API cấm xem lại: không trả đáp án đúng hoặc chi tiết đúng/sai sau khi nộp", async () => {
  reset();
  config.config.allowReview = false;
  const { token } = await start();
  await action(token, { action: "answer", questionId: 1, option: "A" });
  const data = await (await action(token, { action: "submit" })).json();
  assert.equal(data.result.score, 5);
  assert.deepEqual(data.result.answers, []);
  assert.ok(data.questions.every((q) => !("correct" in q)));
});
