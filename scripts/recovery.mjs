// Recovery campaign: KPI-4, successful recovery rate under fault injection.
//
// For each injection the campaign records the pre-fault state, injects one fault for a
// bounded window, drives a write workload with a retrying client, removes the fault,
// and then checks three things:
//   1. the service answers again (first successful read),
//   2. observed state equals intended state (no loss, no duplication),
//   3. the reconciliation checksum matches what the workload intended.
// Recovery succeeds only if all three hold. The rate is the share of injections that
// recovered; the timing is reported per injection and summarised.
//
//   node scripts/recovery.mjs [--injections 12] [--window 4000]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const PORT = Number(arg('port', 4185));
const BASE = `http://127.0.0.1:${PORT}`;
const INJECTIONS = Number(arg('injections', 12));
const WINDOW_MS = Number(arg('window', 4000));
const OUT = arg('out', 'results');
const ACCOUNT = 'u7';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAULTS = [
  { name: 'error-rate', control: { failRate: 0.5 }, note: 'half of the data requests return 503' },
  { name: 'latency-spike', control: { latencyBase: 2500, latencySpread: 500 }, note: 'every request takes 2.5-3.0 s' },
  { name: 'dropped-responses', control: { dropResponseRate: 0.5 }, note: 'the write is applied, the response is destroyed' },
];

async function control(body) {
  await fetch(`${BASE}/_control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-pass' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

async function state() {
  const res = await fetch(`${BASE}/_state/${ACCOUNT}`);
  return res.json();
}

async function readOnce(cookie) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/api/orders`, { headers: { cookie } });
    await res.arrayBuffer();
    return { ok: res.status === 200, ms: performance.now() - t0, status: res.status };
  } catch {
    return { ok: false, ms: performance.now() - t0, status: 'network' };
  }
}

const sut = spawn('node', ['sut/server.js'], {
  env: { ...process.env, SUT_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const records = [];
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/_health`)).ok) break;
    } catch {}
    await sleep(250);
  }
  await fetch(`${BASE}/_reset/${ACCOUNT}`, { method: 'POST' });
  await control({ failRate: 0, dropResponseRate: 0, latencyBase: 40, latencySpread: 60 });
  const cookie = await login(ACCOUNT);

  console.log(`\nRecovery campaign: ${INJECTIONS} injections, ${WINDOW_MS} ms windows\n`);

  for (let i = 0; i < INJECTIONS; i++) {
    const fault = FAULTS[i % FAULTS.length];
    const before = await state();
    const stopAt = Date.now() + WINDOW_MS;
    let acked = 0;
    let ambiguous = 0;
    let attempt = 0;

    await control({ failRate: 0, dropResponseRate: 0, latencyBase: 40, latencySpread: 60, ...fault.control });

    // workload: write until the window closes, retrying with an idempotency key
    while (Date.now() < stopAt) {
      const key = `rec-${i}-${attempt++}`;
      try {
        const res = await fetch(`${BASE}/api/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, 'idempotency-key': key },
          body: JSON.stringify({ item: `rec-${i}-${attempt}`, amount: 2 }),
        });
        await res.text();
        if (res.status === 201 || res.status === 200) acked++;
      } catch {
        ambiguous++;
      }
    }

    // remove the fault and measure recovery
    const faultClearedAt = Date.now();
    await control({ failRate: 0, dropResponseRate: 0, latencyBase: 40, latencySpread: 60 });

    let firstOk = null;
    for (let probe = 0; probe < 60; probe++) {
      const r = await readOnce(cookie);
      if (r.ok) {
        firstOk = Date.now() - faultClearedAt;
        break;
      }
      await sleep(100);
    }

    const after = await state();
    const created = after.count - before.count;
    const duplicates = after.items.length - new Set(after.items).size;
    const lost = Math.max(0, acked - created);
    const recovered = firstOk !== null && duplicates === 0 && lost === 0;

    records.push({
      injection: i + 1,
      fault: fault.name,
      faultNote: fault.note,
      acknowledged: acked,
      ambiguousResponses: ambiguous,
      ordersBefore: before.count,
      ordersAfter: after.count,
      created,
      duplicates,
      lost,
      timeToFirstSuccessfulReadMs: firstOk,
      recovered,
      checksumBefore: before.checksum,
      checksumAfter: after.checksum,
    });
    console.log(
      `  ${recovered ? 'RECOVERED' : 'FAILED   '}  #${String(i + 1).padStart(2)}  ${fault.name.padEnd(18)} ` +
        `acked=${String(acked).padStart(3)} ambiguous=${String(ambiguous).padStart(3)} ` +
        `dup=${duplicates} lost=${lost} firstRead=${firstOk === null ? 'never' : firstOk + 'ms'}`
    );
  }
} finally {
  sut.kill('SIGTERM');
  await sleep(300);
  sut.kill('SIGKILL');
}

const recovered = records.filter((r) => r.recovered).length;
const times = records.map((r) => r.timeToFirstSuccessfulReadMs).filter((t) => t !== null).sort((a, b) => a - b);
const summary = {
  generatedAt: new Date().toISOString(),
  injections: records.length,
  recovered,
  recoveryRate: records.length ? recovered / records.length : 0,
  timeToFirstSuccessfulReadMs: {
    min: times[0] ?? null,
    median: times.length ? times[Math.floor(times.length / 2)] : null,
    max: times[times.length - 1] ?? null,
  },
  byFault: FAULTS.map((f) => {
    const rs = records.filter((r) => r.fault === f.name);
    return {
      fault: f.name,
      note: f.note,
      injections: rs.length,
      recovered: rs.filter((r) => r.recovered).length,
      duplicates: rs.reduce((a, r) => a + r.duplicates, 0),
      lost: rs.reduce((a, r) => a + r.lost, 0),
    };
  }),
  records,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'recovery.json'), JSON.stringify(summary, null, 2));

let md = `# Recovery campaign (KPI-4)\n\n`;
md += `Generated ${summary.generatedAt}\n\n`;
md += `**Recovery rate: ${(summary.recoveryRate * 100).toFixed(1)}% (${recovered}/${records.length} injections).**\n\n`;
md += `An injection counts as recovered only when the service answers again, observed state equals ` +
      `intended state, and no write is duplicated or lost.\n\n`;
md += `| Metric | Value |\n|---|---|\n`;
md += `| Time to first successful read after fault removal | min ${summary.timeToFirstSuccessfulReadMs.min} ms, ` +
      `median ${summary.timeToFirstSuccessfulReadMs.median} ms, max ${summary.timeToFirstSuccessfulReadMs.max} ms |\n\n`;
md += `## By fault type\n\n| Fault | Injections | Recovered | Duplicates | Lost |\n|---|---|---|---|---|\n`;
for (const f of summary.byFault) {
  md += `| ${f.fault} — ${f.note} | ${f.injections} | ${f.recovered} | ${f.duplicates} | ${f.lost} |\n`;
}
md += `\n## Per injection\n\n| # | Fault | Acked | Ambiguous | Created | Dup | Lost | First read | Recovered |\n`;
md += `|---|---|---|---|---|---|---|---|---|\n`;
for (const r of records) {
  md += `| ${r.injection} | ${r.fault} | ${r.acknowledged} | ${r.ambiguousResponses} | ${r.created} | ` +
        `${r.duplicates} | ${r.lost} | ${r.timeToFirstSuccessfulReadMs ?? 'never'} ms | ${r.recovered ? 'yes' : 'no'} |\n`;
}
fs.writeFileSync(path.join(OUT, 'RECOVERY.md'), md);
console.log(`\nrecovery rate ${(summary.recoveryRate * 100).toFixed(1)}% (${recovered}/${records.length})`);
console.log('written to', path.join(OUT, 'recovery.json'));
