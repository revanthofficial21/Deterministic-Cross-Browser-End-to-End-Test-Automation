// Negative-test and recovery campaign: NT-1 to NT-5.
//
// Each test creates a controlled condition, asserts the documented safe behaviour,
// executes the documented recovery, and retains the evidence the charter asks for:
// trigger, precondition, configuration, expected versus observed, measurements,
// recovery time, residual-risk decision.
//
//   node scripts/faults.mjs            # runs all five against a SUT it starts itself
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.SUT_PORT || 4183);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT_DIR || 'results';
const ACCOUNTS = Number(process.env.ACCOUNTS || 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- harness
const results = [];

function record(nt, title, fields) {
  results.push({ id: nt, title, at: new Date().toISOString(), ...fields });
  const verdict = fields.verdict;
  const mark = verdict === 'pass' ? 'PASS' : verdict === 'hold' ? 'HOLD' : 'FAIL';
  console.log(`  ${mark}  ${nt}  ${title}`);
  for (const [k, v] of Object.entries(fields.observed || {})) {
    console.log(`         ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}

async function control(body) {
  const res = await fetch(`${BASE}/_control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function resetAll() {
  for (let i = 1; i <= ACCOUNTS; i++) await fetch(`${BASE}/_reset/u${i}`, { method: 'POST' });
}

async function login(username, password = 'test-pass') {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${username}: ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return cookie;
}

async function api(cookie, pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', cookie, ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

async function state(username) {
  const res = await fetch(`${BASE}/_state/${username}`);
  return res.json();
}

// ---------------------------------------------------------------- NT-1
// Intermittent failures injected at the application boundary. Expected: the suite
// reports failures rather than false passes, the failures are attributable to the
// injected fault, and once the fault is removed the suite returns to clean.
async function nt1() {
  const started = Date.now();
  const cookie = await login('u1');
  await control({ failRate: 0, dropResponseRate: 0, latencyBase: 40, latencySpread: 60 });

  const probe = async (trials) => {
    let errors = 0;
    let injected = 0;
    for (let i = 0; i < trials; i++) {
      const r = await api(cookie, '/api/orders');
      if (r.status !== 200) {
        errors++;
        if (r.body && r.body.error === 'injected_fault') injected++;
      }
    }
    return { trials, errors, injected, errorRate: errors / trials };
  };

  const baseline = await probe(40);
  await control({ failRate: 0.4 });
  const during = await probe(40);
  const tRecover = Date.now();
  await control({ failRate: 0 });
  const after = await probe(40);
  const recoveryMs = Date.now() - tRecover;

  const attributed = during.errors > 0 && during.injected === during.errors;
  const noFalsePass = after.errors === 0;
  record('NT-1', 'Intermittent failure injected at the application boundary', {
    trigger: 'failRate=0.4 on the SUT data routes for 40 requests',
    expected:
      'Failures are reported, every failure is attributable to the injected fault, no request is silently passed, and the system returns to clean once the fault is removed',
    observed: {
      baselineErrorRate: baseline.errorRate.toFixed(3),
      injectedErrorRate: during.errorRate.toFixed(3),
      errorsAttributedToFault: `${during.injected}/${during.errors}`,
      errorRateAfterRemoval: after.errorRate.toFixed(3),
      recoveryMs,
    },
    verdict: attributed && noFalsePass && during.errors > 0 ? 'pass' : 'fail',
    residualRisk: attributed
      ? 'low: failures are attributable, but a real product error during an injection window would be indistinguishable from the injected fault'
      : 'high: attribution failed',
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------- NT-2
// Two flows deliberately sharing one account. Expected: the collision is either
// detected and failed closed, or removed by isolation; it is never silently allowed
// to contaminate another test's assertion.
async function nt2() {
  const started = Date.now();
  await control({ failRate: 0, dropResponseRate: 0 });

  // Shared account: four concurrent writers toggling the same setting.
  const cookie = await login('u1');
  const rounds = 12;
  let lostUpdates = 0;
  for (let i = 0; i < rounds; i++) {
    const values = ['dark', 'light', 'dark', 'light'];
    await Promise.all(
      values.map((v) =>
        api(cookie, '/api/settings', { method: 'PUT', body: JSON.stringify({ theme: v }) })
      )
    );
    const final = await api(cookie, '/api/settings');
    // The last writer is undefined under concurrency: any of the four values is
    // "legal", but a reader cannot know which. Count rounds where the observed
    // value is not the value that worker 0 believed it wrote.
    if (final.body.settings.theme !== values[0]) lostUpdates++;
  }

  // Isolated accounts: one account per writer, so no shared mutable cell exists.
  const cookies = await Promise.all(['u2', 'u3', 'u4', 'u5'].map((u) => login(u)));
  let isolatedLost = 0;
  for (let i = 0; i < rounds; i++) {
    const values = ['dark', 'light', 'dark', 'light'];
    await Promise.all(
      cookies.map((c, idx) =>
        api(c, '/api/settings', { method: 'PUT', body: JSON.stringify({ theme: values[idx] }) })
      )
    );
    const finals = await Promise.all(cookies.map((c) => api(c, '/api/settings')));
    finals.forEach((f, idx) => {
      if (f.body.settings.theme !== values[idx]) isolatedLost++;
    });
  }

  record('NT-2', 'Shared authentication state across parallel flows', {
    trigger: `4 concurrent writers to one account over ${rounds} rounds, repeated with one account per writer`,
    expected:
      'With a shared account the collision is observable; with per-worker isolation no writer observes another writer\u2019s value',
    observed: {
      sharedAccountRoundsWithForeignValue: `${lostUpdates}/${rounds}`,
      isolatedRoundsWithForeignValue: `${isolatedLost}/${rounds * 4}`,
      isolationRemovesCoupling: lostUpdates > 0 && isolatedLost === 0,
    },
    verdict: lostUpdates > 0 && isolatedLost === 0 ? 'pass' : 'hold',
    residualRisk:
      lostUpdates > 0
        ? 'low: coupling is reproducible and removed by isolation; a suite that still shares an account is not protected'
        : 'medium: coupling did not reproduce in this window, so the test is inconclusive rather than passing',
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------- NT-3 and NT-4
// Evidence insufficiency. Scored by scripts/diagnose.mjs, which must refuse to name
// a cause when the evidence cannot support one.
async function nt3nt4() {
  const started = Date.now();
  const { scoreBundle } = await import('./diagnose.mjs');
  await control({ failRate: 0, dropResponseRate: 0 });

  const full = await scoreBundle({ simulate: 'complete' });
  const stripped = await scoreBundle({ simulate: 'no-artefacts' });
  const noNetwork = await scoreBundle({ simulate: 'no-network' });

  record('NT-3', 'A failure stripped of trace artefacts', {
    trigger: 'diagnosis attempted against a failure whose trace bundle is absent',
    expected:
      'The system reports insufficient evidence and declines to name a cause, instead of producing a confident but unsupported diagnosis',
    observed: {
      scoreWithEvidence: full.score,
      verdictWithEvidence: full.verdict,
      scoreWithoutEvidence: stripped.score,
      verdictWithoutEvidence: stripped.verdict,
      namedCauseWithoutEvidence: stripped.namedCause,
    },
    verdict:
      stripped.verdict === 'insufficient_evidence' && stripped.namedCause === null ? 'pass' : 'fail',
    residualRisk: 'low: the failure mode is a refusal to diagnose, which is safe',
    durationMs: Date.now() - started,
  });

  record('NT-4', 'Telemetry insufficient to identify the failing component', {
    trigger: 'the network stream is removed from an otherwise complete trace bundle',
    expected:
      'The gap is reported as a distinct outcome class naming the missing signal, not as a low-confidence diagnosis',
    observed: {
      score: noNetwork.score,
      verdict: noNetwork.verdict,
      missingSignals: noNetwork.missing,
    },
    verdict: noNetwork.verdict === 'telemetry_gap' ? 'pass' : 'fail',
    residualRisk: 'low: the gap is named, so the operator knows which signal to add',
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------- NT-5
// Partial failure: the write is applied and the response is destroyed. Expected:
// no silent loss and no duplicate work; reconciliation from the last durable
// checkpoint proves it.
async function nt5() {
  const started = Date.now();
  await fetch(`${BASE}/_reset/u6`, { method: 'POST' });
  await control({ failRate: 0, dropResponseRate: 0.5, latencyBase: 20, latencySpread: 40 });

  const cookie = await login('u6');
  const before = await state('u6');
  const intended = 20;
  let acknowledged = 0;
  let ambiguous = 0;

  // Client policy: retry an unacknowledged write with the same idempotency key.
  for (let i = 0; i < intended; i++) {
    const key = `nt5-${i}`;
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      try {
        const r = await api(cookie, '/api/orders', {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: JSON.stringify({ item: `nt5-item-${i}`, amount: 3 }),
        });
        if (r.status === 200 || r.status === 201) {
          acknowledged++;
          done = true;
        }
      } catch {
        ambiguous++;
      }
    }
  }

  const after = await state('u6');
  const tReconcile = Date.now();
  const created = after.count - before.count;
  const duplicates = after.items.length - new Set(after.items).size;
  const expectedCount = before.count + intended;
  const lost = Math.max(0, expectedCount - after.count);
  await control({ dropResponseRate: 0 });
  const reconcileMs = Date.now() - tReconcile;

  record('NT-5', 'Partial failure leaves desired and observed state inconsistent', {
    trigger:
      'dropResponseRate=0.5: the write is applied server-side and the response is destroyed, so the client cannot tell whether it succeeded',
    expected:
      'No silent loss and no duplicate work; the client retries with an idempotency key and reconciliation from the last durable checkpoint proves the observed state matches the intended state',
    observed: {
      writesIntended: intended,
      acknowledged,
      ambiguousResponses: ambiguous,
      ordersBefore: before.count,
      ordersAfter: after.count,
      created,
      duplicates,
      lost,
      checksumAfter: after.checksum,
      reconcileMs,
    },
    verdict: duplicates === 0 && lost === 0 && created === intended ? 'pass' : 'fail',
    residualRisk:
      duplicates === 0 && lost === 0
        ? 'low: exactly-once effect is preserved by the idempotency key, but only for clients that send one'
        : 'high: duplicated or lost work observed',
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------- main
const sut = spawn('node', ['sut/server.js'], {
  env: { ...process.env, SUT_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let sutLog = '';
sut.stdout.on('data', (d) => (sutLog += d));
sut.stderr.on('data', (d) => (sutLog += d));

try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/_health`)).ok) break;
    } catch {}
    await sleep(250);
  }
  console.log('\nNegative-test and recovery campaign\n');
  await resetAll();
  await nt1();
  await nt2();
  await nt3nt4();
  await nt5();
} finally {
  sut.kill('SIGTERM');
  await sleep(300);
  sut.kill('SIGKILL');
}

const summary = {
  generatedAt: new Date().toISOString(),
  passed: results.filter((r) => r.verdict === 'pass').length,
  held: results.filter((r) => r.verdict === 'hold').length,
  failed: results.filter((r) => r.verdict === 'fail').length,
  results,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'negative-tests.json'), JSON.stringify(summary, null, 2));

let md = `# Negative-test and recovery campaign\n\nGenerated ${summary.generatedAt}\n\n`;
md += `**${summary.passed} passed, ${summary.held} held, ${summary.failed} failed.**\n\n`;
for (const r of results) {
  md += `## ${r.id} — ${r.title}\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| Verdict | **${r.verdict}** |\n`;
  md += `| Trigger | ${r.trigger} |\n`;
  md += `| Expected safe behaviour | ${r.expected} |\n`;
  for (const [k, v] of Object.entries(r.observed)) md += `| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |\n`;
  md += `| Residual-risk decision | ${r.residualRisk} |\n`;
  md += `| Duration | ${r.durationMs} ms |\n\n`;
}
fs.writeFileSync(path.join(OUT, 'NEGATIVE-TESTS.md'), md);
console.log(`\n${summary.passed} passed, ${summary.held} held, ${summary.failed} failed`);
console.log('written to', path.join(OUT, 'negative-tests.json'));
if (summary.failed > 0) process.exitCode = 1;
