// Load measurement for KPI-5 (service error rate) and KPI-6 (request latency p95).
//
// Declared load is fixed here, not discovered at run time: 16 concurrent clients for
// 20 seconds against the authenticated orders endpoint, after a warm-up. Latency is
// measured with a monotonic clock on the client, so a clock adjustment cannot
// flatter the result.
//
//   node scripts/load.mjs [--concurrency 16] [--seconds 20]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg('port', 4184));
const BASE = `http://127.0.0.1:${PORT}`;
const CONCURRENCY = Number(arg('concurrency', 16));
const SECONDS = Number(arg('seconds', 20));
const WARMUP_MS = 3000;
const OUT = arg('out', 'results');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-pass' }),
  });
  if (!res.ok) throw new Error(`login ${username} -> ${res.status}`);
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

const sut = spawn('node', ['sut/server.js'], {
  env: { ...process.env, SUT_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let result;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/_health`)).ok) break;
    } catch {}
    await sleep(250);
  }
  // Frozen envelope for the load run: no injected faults, baseline latency.
  await fetch(`${BASE}/_control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ latencyBase: 80, latencySpread: 240, renderDelay: 100, failRate: 0, dropResponseRate: 0 }),
  });

  const cookies = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => login(`u${(i % 8) + 1}`))
  );

  const latencies = [];
  let errors = 0;
  let requests = 0;
  const statusCounts = {};

  const worker = async (cookie, stopAt) => {
    while (Date.now() < stopAt) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE}/api/orders`, { headers: { cookie } });
        await res.arrayBuffer();
        const dt = performance.now() - t0;
        requests++;
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
        if (res.status !== 200) errors++;
        else latencies.push(dt);
      } catch {
        requests++;
        errors++;
        statusCounts.error = (statusCounts.error || 0) + 1;
      }
    }
  };

  // warm-up: excluded from the measurement
  await Promise.all(cookies.map((c) => worker(c, Date.now() + WARMUP_MS)));
  latencies.length = 0;
  errors = 0;
  requests = 0;
  for (const k of Object.keys(statusCounts)) delete statusCounts[k];

  const startedAt = Date.now();
  const stopAt = startedAt + SECONDS * 1000;
  await Promise.all(cookies.map((c) => worker(c, stopAt)));
  const elapsed = (Date.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);
  result = {
    declaredLoad: { concurrency: CONCURRENCY, seconds: SECONDS, endpoint: 'GET /api/orders' },
    requests,
    throughputPerSecond: Number((requests / elapsed).toFixed(1)),
    errorRate: Number((errors / requests).toFixed(4)),
    statusCounts,
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: Number((latencies[latencies.length - 1] || 0).toFixed(1)),
      samples: latencies.length,
    },
    measuredAt: new Date().toISOString(),
  };
} finally {
  sut.kill('SIGTERM');
  await sleep(300);
  sut.kill('SIGKILL');
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'load.json'), JSON.stringify(result, null, 2));

let md = `# Load measurement (KPI-5, KPI-6)\n\n`;
md += `Declared load: ${result.declaredLoad.concurrency} concurrent clients for ${result.declaredLoad.seconds} s ` +
      `against \`${result.declaredLoad.endpoint}\`, after a 3 s warm-up that is excluded from the measurement.\n\n`;
md += `| Metric | Value |\n|---|---|\n`;
md += `| Requests measured | ${result.requests} |\n`;
md += `| Throughput | ${result.throughputPerSecond} req/s |\n`;
md += `| **Service error rate (KPI-5)** | **${(result.errorRate * 100).toFixed(2)}%** |\n`;
md += `| Latency p50 | ${result.latencyMs.p50} ms |\n`;
md += `| **Latency p95 (KPI-6)** | **${result.latencyMs.p95} ms** |\n`;
md += `| Latency p99 | ${result.latencyMs.p99} ms |\n`;
md += `| Latency max | ${result.latencyMs.max} ms |\n\n`;
md += `Status distribution: \`${JSON.stringify(result.statusCounts)}\`\n\n`;
md += `The KPI targets are expressed relative to a reference measurement in the same envelope.\n`;
md += `This run establishes the absolute values; the reference comparison belongs to the\n`;
md += `representative environment where both configurations can be run at the same declared load.\n`;
fs.writeFileSync(path.join(OUT, 'LOAD.md'), md);

console.log(md);
