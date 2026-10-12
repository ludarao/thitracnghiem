import test from "node:test";
import assert from "node:assert/strict";
import {
  readLimitedJson,
  verifyTurnstile,
} from "../src/lib/request-security.ts";
const request = (text, headers = {}) =>
  new Request("https://quiz.example/api/exam", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: text,
  });
test("bounded JSON rejects oversized declared and actual data, invalid JSON and arrays", async () => {
  assert.deepEqual(await readLimitedJson(request('{"a":1}'), 100), { a: 1 });
  for (const input of ["[1]", "null", "{"])
    await assert.rejects(
      readLimitedJson(request(input), 100),
      (e) => e.status === 400,
    );
  await assert.rejects(
    readLimitedJson(request("x".repeat(101)), 100),
    (e) => e.status === 413,
  );
  await assert.rejects(
    readLimitedJson(request("{}", { "content-length": "200" }), 100),
    (e) => e.status === 413,
  );
  await assert.rejects(
    readLimitedJson(request("{}", { "content-type": "text/plain" }), 100),
    (e) => e.status === 415,
  );
});
test("Turnstile checks server response, action and hostname; outages fail closed", async () => {
  const old = {
    enabled: process.env.TURNSTILE_ENABLED,
    key: process.env.TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
    fetch: globalThis.fetch,
  };
  try {
    process.env.TURNSTILE_ENABLED = "true";
    process.env.TURNSTILE_SITE_KEY = "fixture";
    process.env.TURNSTILE_SECRET_KEY = "fixture-secret";
    await assert.rejects(
      verifyTurnstile("", "exam_start", "quiz.example"),
      (e) => e.status === 403,
    );
    let answer = {
      success: true,
      action: "exam_start",
      hostname: "quiz.example",
    };
    globalThis.fetch = async () => Response.json(answer);
    await verifyTurnstile("token", "exam_start", "quiz.example");
    for (const invalid of [
      { ...answer, success: false },
      { ...answer, action: "admin_login" },
      { ...answer, hostname: "other.example" },
    ]) {
      answer = invalid;
      await assert.rejects(
        verifyTurnstile("token", "exam_start", "quiz.example"),
        (e) => e.status === 403,
      );
    }
    globalThis.fetch = async () => {
      throw new Error("unavailable");
    };
    await assert.rejects(
      verifyTurnstile("token", "exam_start", "quiz.example"),
      (e) => e.status === 503,
    );
    delete process.env.TURNSTILE_SECRET_KEY;
    await assert.rejects(
      verifyTurnstile("token", "exam_start", "quiz.example"),
      (e) => e.status === 503,
    );
    process.env.TURNSTILE_ENABLED = "false";
    await verifyTurnstile(undefined, "exam_start", "quiz.example");
  } finally {
    globalThis.fetch = old.fetch;
    for (const [key, value] of [
      ["TURNSTILE_ENABLED", old.enabled],
      ["TURNSTILE_SITE_KEY", old.key],
      ["TURNSTILE_SECRET_KEY", old.secret],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
