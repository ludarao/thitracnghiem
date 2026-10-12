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
let config, candidates, attempts, account, sessions, sequence, legacy;
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
  legacy = new Map();
  candidates = new Map();
  attempts = new Map();
  sessions = new Map();
  account = null;
  sequence = 0;
}
const db = {
  quizSettings: {
    findUnique: async () => config,
    upsert: async () => config,
    update: async ({ data }) => (config = { ...config, ...data }),
  },
  candidate: {
    findMany: async (query) => exportPage([...candidates.values()], query),
    upsert: async ({ where, create }) => {
      if (!candidates.has(where.code))
        candidates.set(where.code, {
          id: "candidate-" + ++sequence,
          ...create,
        });
      return candidates.get(where.code);
    },
  },
  attempt: {
    deleteMany: async () => {
      const count = attempts.size;
      attempts.clear();
      return { count };
    },
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
    updateMany: async ({ where, data }) => {
      const a = attempts.get(where.id);
      if (!a || a.submittedAt !== null) return { count: 0 };
      Object.assign(a, data, { version: a.version + 1 });
      return { count: 1 };
    },
    update: async ({ where, data }) => {
      const a = attempts.get(where.id);
      Object.assign(a, data, { version: a.version + 1 });
      return a;
    },
    findMany: async ({ where, take, select, orderBy }) =>
      orderBy?.id === "asc"
        ? exportPage([...attempts.values()], { where, take })
        : [...attempts.values()]
            .filter(
              (a) =>
                (!where.id || where.id.in.includes(a.id)) &&
                (!where.examId || a.examId === where.examId) &&
                (!where.OR ||
                  where.OR.some((c) =>
                    c.submittedAt?.lt
                      ? a.submittedAt < c.submittedAt.lt
                      : a.submittedAt?.getTime() === c.submittedAt?.getTime() &&
                        a.id < c.id.lt,
                  )) &&
                (!where.submittedAt ||
                  (where.submittedAt === null
                    ? a.submittedAt === null
                    : a.submittedAt !== null)),
            )
            .sort(
              (a, b) =>
                (b.submittedAt?.getTime() || 0) -
                (a.submittedAt?.getTime() || 0),
            )
            .slice(0, take)
            .map((a) =>
              select
                ? Object.fromEntries(Object.keys(select).map((k) => [k, a[k]]))
                : a,
            ),
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
require.cache[require.resolve("next/cache")] = {
  exports: {
    unstable_cache: (fn) => fn,
    revalidateTag: () => {},
    revalidatePath: () => {},
  },
};
db.questionBank = {
  upsert: async ({ create }) => create,
  findUnique: async () => null,
};
db.examResult = {
  findMany: async (query) => exportPage([...legacy.values()], query),
  deleteMany: async () => {
    const count = legacy.size;
    legacy.clear();
    return { count };
  },
};
db.questionBank.findMany = async () => [];
function exportPage(records, { where = {}, take }) {
  return records
    .filter((r) => !where.id?.gt || r.id > where.id.gt)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, take);
}
db.$queryRaw = async (strings, ...values) => {
  if (/FOR (SHARE|UPDATE)/.test(strings.join(" "))) return [config];
  assert.match(
    strings.join(" "),
    /"summary"->>'score'\)\:\:numeric DESC NULLS LAST/,
  );
  const rows = [...attempts.values()]
    .filter((a) => a.examId === values[0] && a.submittedAt)
    .sort(
      (a, b) =>
        b.summary.score - a.summary.score ||
        b.submittedAt - a.submittedAt ||
        b.id.localeCompare(a.id),
    );
  const seen = new Set();
  if (strings.join(" ").includes("GROUP BY")) {
    const latest = new Map();
    for (const r of rows)
      if (!latest.has(r.candidateId)) latest.set(r.candidateId, r);
    const grouped = new Map();
    for (const r of latest.values())
      grouped.set(r.info.unit, (grouped.get(r.info.unit) || 0) + 1);
    return [...grouped].map(([unit, count]) => ({
      unit,
      count: BigInt(count),
    }));
  }
  return rows
    .filter((a) => {
      if (seen.has(a.candidateId)) return false;
      seen.add(a.candidateId);
      return true;
    })
    .map((a) => ({ summary: a.summary, total: BigInt(rows.length) }));
};
const exam = require("../src/app/api/exam/route.ts");
const admin = require("../src/app/api/admin/route.ts");
const settings = require("../src/app/api/config/route.ts");
const results = require("../src/app/api/results/route.ts");
const examData = require("../src/app/api/admin/exam-data/route.ts");
const userInfo = {
  serviceNumber: "649-605",
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

test("API hồ sơ 1.2: cùng số hiệu dùng cùng mã; chỉ lưu số hiệu và đơn vị", async () => {
  reset();
  const first = await start({
    ...userInfo,
    fullName: "Không thu thập",
    phone: "0912345678",
    rank: "Không thu thập",
    position: "Không thu thập",
  });
  const second = await start({ ...userInfo, serviceNumber: "649605" });
  assert.equal(first.candidateCode, "649-605");
  assert.equal(second.candidateCode, first.candidateCode);
  assert.equal(candidates.size, 1);
  assert.deepEqual(first.userInfo, { ...userInfo, candidateCode: "649-605" });
  assert.deepEqual([...candidates.values()][0].info, first.userInfo);
  assert.equal([...candidates.values()][0].phone, null);
  const third = await start({ ...userInfo, serviceNumber: "649-606" });
  assert.notEqual(third.candidateCode, first.candidateCode);
  assert.equal(candidates.size, 2);
});
test("API số hiệu: từ chối thiếu/sai số hiệu và đơn vị ngoài danh sách", async () => {
  reset();
  for (const info of [
    { unit: userInfo.unit },
    { ...userInfo, serviceNumber: "" },
    { ...userInfo, serviceNumber: "a<script>" },
    { ...userInfo, unit: "Đơn vị không tồn tại" },
  ]) {
    const response = await expectedError(() =>
      exam.POST(req("/api/exam", "POST", { userInfo: info })),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(candidates.size, 0);
  assert.equal(attempts.size, 0);
});
test("API lượt thi: không lộ đáp án đúng, chấm server và nộp trùng không đổi kết quả", async () => {
  reset();
  const { token } = await start();
  let response = await exam.GET(
    req("/api/exam", "GET", undefined, bearer(token)),
  );
  let data = await response.json();
  assert.ok(data.questions.every((q) => !("correct" in q)));

  response = await action(token, {
    action: "submit",
    answers: { 1: "A" },
    score: 10,
  });
  data = await response.json();
  assert.equal(data.result.score, 5);
  const submitted = data.result.submittedAt;
  response = await action(token, { action: "submit", answers: {} });
  data = await response.json();
  assert.equal(data.result.submittedAt, submitted);
  assert.equal(attempts.size, 1);
  assert.equal([...attempts.values()][0].version, 1);
  assert.ok(
    [...attempts.values()][0].questions.every(
      (q) => !q.question && q.order.length === 4,
    ),
  );
});
test("API bảng xếp hạng: giữ điểm cao nhất dù lượt cuối thấp hơn, ẩn điện thoại/mã trên bảng công khai", async () => {
  reset();
  let first = await start();
  await action(first.token, { action: "submit", answers: { 1: "A", 2: "B" } });
  await new Promise((r) => setTimeout(r, 2));
  const second = await start();
  await action(second.token, { action: "submit", answers: {} });
  const data = await (await results.GET(req("/api/results"))).json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].score, 10);
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
test("API kỳ mới: giữ lịch sử, bảng kỳ mới rỗng, chỉ admin xem được số hiệu trong lịch sử", async () => {
  reset();
  const { token } = await start();
  await action(token, { action: "submit", answers: {} });
  const headers = await login();
  await results.DELETE(req("/api/results", "DELETE", undefined, headers));
  assert.equal(attempts.size, 1);
  const publicData = await (await results.GET(req("/api/results"))).json();
  assert.equal(publicData.results.length, 0);
  const history = await (
    await results.GET(req("/api/results?history=1", "GET", undefined, headers))
  ).json();
  assert.equal(history.history.length, 1);
  assert.equal(
    history.history[0].userInfo.serviceNumber,
    userInfo.serviceNumber,
  );
});
test("API offline: nhận bài sau hạn, giữ hạn giờ và không tự chấm lượt chưa gửi", async () => {
  reset();
  const { id, token } = await start();
  const a = attempts.get(id);
  a.deadline = new Date(Date.now() - 1000);
  assert.equal(
    (await (await results.GET(req("/api/results"))).json()).results.length,
    0,
  );
  const data = await (
    await action(token, { action: "submit", answers: { 1: "A" } })
  ).json();
  assert.equal(data.result.submittedAt, a.deadline.toISOString());
  assert.equal(data.result.score, 5);
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
    401,
  );
});

test("API bắt đầu trả đầy đủ đề; không nhận request chọn từng đáp án", async () => {
  reset();
  const data = await start();
  assert.equal(data.questions.length, 2);
  assert.equal(data.result, null);
  assert.ok(data.questions.every((q) => !("correct" in q)));
  assert.equal(
    (await action(data.token, { action: "answer", questionId: 1, option: "A" }))
      .status,
    400,
  );
});
test("API cấm xem lại: không trả đáp án đúng hoặc chi tiết đúng/sai sau khi nộp", async () => {
  reset();
  config.config.allowReview = false;
  const { token } = await start();

  const data = await (
    await action(token, { action: "submit", answers: { 1: "A" } })
  ).json();
  assert.equal(data.result.score, 5);
  assert.deepEqual(data.result.answers, []);
  assert.ok(data.questions.every((q) => !("correct" in q)));
});

test("API lịch sử: phân trang 50 lượt, không đọc đề hoặc đáp án, trang sau không trùng", async () => {
  reset();
  const { token, id } = await start();
  await action(token, { action: "submit", answers: { 1: "A" } });
  const template = attempts.get(id);
  for (let i = 0; i < 55; i++) {
    const row = {
      ...template,
      id: "extra-" + String(i).padStart(3, "0"),
      submittedAt: new Date(Date.now() + i + 1),
      summary: { ...template.summary, id: "extra-" + i },
    };
    attempts.set(row.id, row);
  }
  const headers = await login();
  const first = await (
    await results.GET(req("/api/results?history=1", "GET", undefined, headers))
  ).json();
  assert.equal(first.history.length, 50);
  assert.ok(first.nextCursor);
  assert.ok(first.history.every((r) => !r.questions && r.answers.length === 0));
  const second = await (
    await results.GET(
      req(
        "/api/results?history=1&cursor=" + first.nextCursor,
        "GET",
        undefined,
        headers,
      ),
    )
  ).json();
  assert.equal(second.history.length, 6);
  assert.equal(second.nextCursor, null);
  assert.ok(
    second.history.every((r) => !first.history.some((f) => f.id === r.id)),
  );
});

test("API ngân hàng đề: lượt thi giữ phiên bản cũ sau khi admin sửa ngân hàng", async () => {
  reset();
  const old = await start();
  config.questions = config.questions.map((q) => ({
    ...q,
    correct: "D",
    question: "Changed",
  }));
  const current = await start();
  assert.equal(current.questions[0].question, "Changed");
  const result = await (
    await action(old.token, { action: "submit", answers: { 1: "A" } })
  ).json();
  assert.equal(result.result.score, 5);
});

test("API từ chối batch sai không ghi kết quả", async () => {
  reset();
  const { id, token } = await start();
  for (const answers of [{ 999: "A" }, { 1: "Z" }, []]) {
    const response = await expectedError(() =>
      action(token, { action: "submit", answers }),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(attempts.get(id).submittedAt, null);
  assert.equal(attempts.get(id).version, 0);
});

test("API 5001 người: response 100 người/trang, thống kê và tập thể tính toàn bộ", async () => {
  reset();
  const { token, id } = await start();
  await action(token, { action: "submit", answers: { 1: "A" } });
  const template = attempts.get(id);
  for (let i = 0; i < 5000; i++) {
    const row = {
      ...template,
      id: "bulk-" + i,
      candidateId: "bulk-candidate-" + i,
      summary: { ...template.summary, id: "bulk-" + i },
    };
    attempts.set(row.id, row);
  }
  const first = await (await results.GET(req("/api/results"))).json();
  assert.equal(first.results.length, 100);
  assert.equal(first.totalParticipants, 5001);
  assert.equal(first.totalAttempts, 5001);
  const counts = await (await results.GET(req("/api/results?counts=1"))).json();
  assert.equal(
    counts.units.find((r) => r.unit === userInfo.unit).participantCount,
    5001,
  );
  const last = await (await results.GET(req("/api/results?page=51"))).json();
  assert.equal(last.results.length, 1);
  assert.equal(last.hasMore, false);
});

test("API số lượng: bằng điểm lấy đơn vị lượt mới hơn, chỉ tính một người; đơn vị chưa thi là 0", async () => {
  reset();
  const first = await start();
  await action(first.token, { action: "submit", answers: {} });
  const second = await start({
    ...userInfo,
    unit: DEFAULT_CONFIG.units[1].name,
  });
  await new Promise((r) => setTimeout(r, 2));
  await action(second.token, { action: "submit", answers: {} });
  await start({ ...userInfo, serviceNumber: "649-607" });
  const data = await (await results.GET(req("/api/results?counts=1"))).json();
  assert.equal(
    data.units.find((r) => r.unit === userInfo.unit).participantCount,
    0,
  );
  assert.equal(
    data.units.find((r) => r.unit === DEFAULT_CONFIG.units[1].name)
      .participantCount,
    1,
  );
  assert.ok(!("results" in data));
  assert.ok(!("ranks" in data));
  assert.ok(!("config" in data));
});

test("API nộp đồng thời cùng lượt: một kết quả thắng, đáp án không bị ghi đè", async () => {
  reset();
  const { token } = await start();
  const replies = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      action(token, { action: "submit", answers: { 1: i % 2 ? "A" : "B" } }),
    ),
  );
  const data = await Promise.all(replies.map((r) => r.json()));
  assert.ok(
    data.every(
      (r) => JSON.stringify(r.result) === JSON.stringify(data[0].result),
    ),
  );
  assert.equal([...attempts.values()][0].version, 1);
});

test("API điểm cao nhất: nâng điểm, giữ đơn vị lượt tốt nhất và đủ lịch sử", async () => {
  reset();
  const first = await start();
  await action(first.token, { action: "submit", answers: {} });
  const best = await start({ ...userInfo, unit: DEFAULT_CONFIG.units[1].name });
  await action(best.token, { action: "submit", answers: { 1: "A", 2: "B" } });
  const last = await start();
  await action(last.token, { action: "submit", answers: { 1: "A" } });
  const data = await (await results.GET(req("/api/results"))).json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].id, best.id);
  assert.equal(data.results[0].score, 10);
  const counts = await (await results.GET(req("/api/results?counts=1"))).json();
  assert.equal(
    counts.units.find((r) => r.unit === userInfo.unit).participantCount,
    0,
  );
  assert.equal(
    counts.units.find((r) => r.unit === DEFAULT_CONFIG.units[1].name)
      .participantCount,
    1,
  );
  const headers = await login();
  const history = await (
    await results.GET(req("/api/results?history=1", "GET", undefined, headers))
  ).json();
  assert.equal(history.history.length, 3);
});

test("API bảo vệ: thiếu xác minh không tạo hồ sơ/lượt thi hoặc chạy đăng nhập", async () => {
  reset();
  process.env.TURNSTILE_ENABLED = "true";
  process.env.TURNSTILE_SITE_KEY = "fixture";
  process.env.TURNSTILE_SECRET_KEY = "fixture-secret";
  try {
    const response = await expectedError(() =>
      exam.POST(req("/api/exam", "POST", { userInfo })),
    );
    assert.equal(response.status, 403);
    assert.equal(candidates.size, 0);
    assert.equal(attempts.size, 0);
    const loginResponse = await expectedError(() =>
      admin.POST(req("/api/admin", "POST", { password: "invalid" })),
    );
    assert.equal(loginResponse.status, 403);
    assert.equal(account, null);
  } finally {
    delete process.env.TURNSTILE_ENABLED;
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test("API cấu hình: có security ở cả phiên Admin và công khai, không lộ secret", async () => {
  reset();
  const headers = await login();
  process.env.TURNSTILE_ENABLED = "true";
  process.env.TURNSTILE_SITE_KEY = "test-public-site-key";
  process.env.TURNSTILE_SECRET_KEY = "test-private-secret";
  try {
    for (const authentication of [{}, headers]) {
      const response = await settings.GET(
        req("/api/config", "GET", undefined, authentication),
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.security, {
        enabled: true,
        siteKey: "test-public-site-key",
      });
      assert.equal(JSON.stringify(data).includes("test-private-secret"), false);
      assert.equal("questions" in data, authentication === headers);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    process.env.TURNSTILE_ENABLED = "false";
    const data = await (
      await settings.GET(req("/api/config", "GET", undefined, headers))
    ).json();
    assert.deepEqual(data.security, { enabled: false, siteKey: "" });
  } finally {
    delete process.env.TURNSTILE_ENABLED;
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test("API 1.3: cấu hình guard được snapshot; báo cáo local đi cùng lần nộp và retry không đổi", async () => {
  reset();
  const first = await start();
  assert.equal(first.config.monitorEnabled, true);
  assert.equal(first.config.maxAwaySeconds, 30);
  assert.equal(first.config.preventCopy, true);
  const localMonitoring = {
    leaveCount: 1,
    totalAwayMs: 31000,
    terminationReason: "away",
  };
  const response = await action(first.token, {
    action: "submit",
    answers: { 1: "A" },
    localMonitoring,
  });
  const submitted = await response.json();
  assert.deepEqual(submitted.result.localMonitoring, {
    ...localMonitoring,
    reportedByClient: true,
  });
  const retry = await (
    await action(first.token, {
      action: "submit",
      answers: {},
      localMonitoring: {
        leaveCount: 0,
        totalAwayMs: 0,
        terminationReason: null,
      },
    })
  ).json();
  assert.deepEqual(
    retry.result.localMonitoring,
    submitted.result.localMonitoring,
  );
  assert.equal(retry.result.score, 5);
  const publicData = await (await results.GET(req("/api/results"))).json();
  assert.ok(!("localMonitoring" in publicData.results[0]));
  const second = await start();
  const bad = await expectedError(() =>
    action(second.token, {
      action: "submit",
      answers: {},
      localMonitoring: {
        leaveCount: -1,
        totalAwayMs: 0,
        terminationReason: null,
      },
    }),
  );
  assert.equal(bad.status, 400);
  assert.equal(attempts.get(second.id).submittedAt, null);
});
test("API 1.3: lưu/tắt giám sát và chống copy ở Admin, không sửa cấu hình lượt đang làm", async () => {
  reset();
  const old = await start();
  const headers = await login();
  const updated = {
    ...config.config,
    monitorEnabled: false,
    maxAwaySeconds: 45,
    preventCopy: false,
  };
  const response = await settings.PUT(
    req(
      "/api/config",
      "PUT",
      { config: updated, questions: config.questions },
      headers,
    ),
  );
  assert.equal(response.status, 200);
  const current = await start();
  assert.equal(current.config.monitorEnabled, false);
  assert.equal(current.config.preventCopy, false);
  assert.equal(current.config.maxAwaySeconds, 45);
  assert.equal(attempts.get(old.id).config.monitorEnabled, true);
  const invalid = await expectedError(() =>
    settings.PUT(
      req(
        "/api/config",
        "PUT",
        {
          config: { ...updated, maxAwaySeconds: 0 },
          questions: config.questions,
        },
        headers,
      ),
    ),
  );
  assert.equal(invalid.status, 400);
});

test("all-exam export is admin-only and paginates submitted and pending attempts across periods", async () => {
  reset();
  assert.equal(
    (
      await expectedError(() =>
        examData.GET(req("/api/admin/exam-data?kind=attempts")),
      )
    ).status,
    401,
  );
  const headers = await login();
  for (let i = 0; i < 205; i++) {
    const id = "export-" + String(i).padStart(4, "0");
    attempts.set(id, {
      id,
      examId: i % 2 ? "old-period" : "exam-1",
      submittedAt: i % 3 ? new Date() : null,
      answers: { 1: "A" },
    });
  }
  let cursor = "",
    all = [],
    pages = 0;
  do {
    const response = await examData.GET(
      req(
        "/api/admin/exam-data?" +
          new URLSearchParams({ kind: "attempts", cursor }),
        "GET",
        null,
        headers,
      ),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const data = await response.json();
    all.push(...data.records);
    cursor = data.nextCursor || "";
    pages++;
    assert.ok(data.records.length <= 100);
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(all.length, 205);
  assert.equal(new Set(all.map((r) => r.id)).size, 205);
  assert.ok(all.some((r) => r.submittedAt === null));
  assert.ok(all.some((r) => r.examId === "old-period"));
  legacy.set("legacy-1", { id: "legacy-1", answersJson: "[]" });
  const old = await examData.GET(
    req("/api/admin/exam-data?kind=legacy", "GET", null, headers),
  );
  assert.equal((await old.json()).records.length, 1);
  assert.equal(
    (
      await expectedError(() =>
        examData.GET(
          req(
            "/api/admin/exam-data?kind=attempts&examId=changed",
            "GET",
            null,
            headers,
          ),
        ),
      )
    ).status,
    409,
  );
});

test("purge requires a logged-in session and correct stored password; keeps config, banks and candidates", async () => {
  reset();
  const started = await start();
  legacy.set("legacy-1", { id: "legacy-1" });
  const body = {
    password: "test-admin-password-2026",
    confirmation: "DELETE_ALL_EXAM_DATA",
  };
  assert.equal(
    (
      await expectedError(() =>
        examData.DELETE(req("/api/admin/exam-data", "DELETE", body)),
      )
    ).status,
    401,
  );
  const headers = await login();
  assert.equal(
    (
      await expectedError(() =>
        examData.DELETE(
          req(
            "/api/admin/exam-data",
            "DELETE",
            { ...body, password: "wrong" },
            headers,
          ),
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await expectedError(() =>
        examData.DELETE(
          req(
            "/api/admin/exam-data",
            "DELETE",
            { ...body, confirmation: "" },
            headers,
          ),
        ),
      )
    ).status,
    400,
  );
  assert.equal(attempts.size, 1);
  assert.equal(legacy.size, 1);
  const before = structuredClone(config);
  const response = await examData.DELETE(
    req("/api/admin/exam-data", "DELETE", body, headers),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).deleted, { attempts: 1, legacy: 1 });
  assert.equal(attempts.size, 0);
  assert.equal(legacy.size, 0);
  assert.equal(candidates.size, 1);
  assert.equal(config.config.isOpen, false);
  assert.notEqual(config.activeExamId, before.activeExamId);
  assert.deepEqual(config.questions, before.questions);
  assert.deepEqual(config.config, { ...before.config, isOpen: false });
  assert.ok(account.passwordHash);
  assert.equal(
    (
      await expectedError(() =>
        exam.GET(req("/api/exam", "GET", null, bearer(started.token))),
      )
    ).status,
    400,
  );
});

test("start fetched before purge cannot insert into the erased period", async () => {
  reset();
  const original = db.candidate.upsert;
  db.candidate.upsert = async (args) => {
    const candidate = await original(args);
    config = {
      ...config,
      activeExamId: "purged-period",
      config: { ...config.config, isOpen: false },
    };
    return candidate;
  };
  try {
    const response = await expectedError(() =>
      exam.POST(req("/api/exam", "POST", { userInfo })),
    );
    assert.equal(response.status, 400);
    assert.equal(attempts.size, 0);
  } finally {
    db.candidate.upsert = original;
  }
});

test("export stays bounded when stored attempt details are large", async () => {
  reset();
  const headers = await login();
  for (let i = 0; i < 4; i++)
    attempts.set("large-" + i, {
      id: "large-" + i,
      result: "x".repeat(1100000),
    });
  const first = await examData.GET(
    req("/api/admin/exam-data?kind=attempts", "GET", null, headers),
  );
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.equal(data.records.length, 2);
  assert.equal(data.nextCursor, "large-1");
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 4 * 1024 * 1024);
  attempts.set("oversized", {
    id: "oversized",
    result: "x".repeat(4 * 1024 * 1024),
  });
  const oversized = await expectedError(() =>
    examData.GET(
      req(
        "/api/admin/exam-data?kind=attempts&cursor=large-3",
        "GET",
        null,
        headers,
      ),
    ),
  );
  assert.equal(oversized.status, 413);
});
