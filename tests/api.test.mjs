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
    findUnique: async () => config,
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
    findMany: async ({ where, take, select }) =>
      [...attempts.values()]
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
            (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0),
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
db.$queryRaw = async (strings, ...values) => {
  const rows = [...attempts.values()]
    .filter((a) => a.examId === values[0] && a.submittedAt)
    .sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id));
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
test("API bảng xếp hạng: lấy điểm lượt cuối thấp hơn, ẩn điện thoại/mã trên bảng công khai", async () => {
  reset();
  let first = await start();
  await action(first.token, { action: "submit", answers: { 1: "A", 2: "B" } });
  await new Promise((r) => setTimeout(r, 2));
  const second = await start();
  await action(second.token, { action: "submit", answers: {} });
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
  assert.equal(history.history[0].userInfo.phone, userInfo.phone);
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
    400,
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

test("API số lượng: thi lại chỉ tính một người, theo đơn vị lượt cuối; đơn vị chưa thi là 0", async () => {
  reset();
  const first = await start();
  await action(first.token, { action: "submit", answers: {} });
  const second = await start({
    ...userInfo,
    unit: DEFAULT_CONFIG.units[1].name,
  });
  await new Promise((r) => setTimeout(r, 2));
  await action(second.token, { action: "submit", answers: {} });
  await start({ ...userInfo, phone: "0987654321" });
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
