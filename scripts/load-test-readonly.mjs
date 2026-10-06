// Read-only public dashboard check. Does not register candidates or submit exams.
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
const endpoint = "https://thitracnghiem-umber.vercel.app/api/results?counts=1";
const started = performance.now();
const results = await Promise.all(
  Array.from({ length: 500 }, async () => {
    const begin = performance.now();
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json();
      return {
        ok: response.ok && body.success && Array.isArray(body.units),
        status: response.status,
        ms: performance.now() - begin,
        cache: response.headers.get("x-vercel-cache"),
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        ms: performance.now() - begin,
        error: e.name,
      };
    }
  }),
);
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const report = {
  date: new Date().toISOString(),
  endpoint,
  scope:
    "500 concurrent read-only dashboard HTTP requests from one client IP; CDN/cache path only, not exam writes",
  requests: 500,
  success: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  elapsedMs: Math.round(performance.now() - started),
  p50Ms: Math.round(times[249]),
  p95Ms: Math.round(times[474]),
  maxMs: Math.round(times.at(-1)),
  statuses: results.reduce(
    (sum, r) => ((sum[r.status] = (sum[r.status] || 0) + 1), sum),
    {},
  ),
  cache: results.reduce(
    (sum, r) => (
      (sum[r.cache || "unknown"] = (sum[r.cache || "unknown"] || 0) + 1),
      sum
    ),
    {},
  ),
};
writeFileSync(
  "reports/load-test-dashboard-production.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (report.failed) process.exitCode = 1;
