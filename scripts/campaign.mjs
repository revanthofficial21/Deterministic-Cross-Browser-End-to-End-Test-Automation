// Acceptance campaign runner.
//
// Executes one condition for a range of repetitions against a freshly seeded SUT,
// so that every repetition starts from identical state. Each repetition appends
// per-test records to results/<condition>.jsonl and one line to
// results/manifest.jsonl. Repetitions are addressable (--start/--reps) so the
// campaign can be executed in bounded slices locally and in one job in CI.
//
//   node scripts/campaign.mjs --condition A --reps 15 --start 1 --workers 4
//   node scripts/campaign.mjs --condition C --reps 15 --start 1 --workers 4
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const CONDITION = arg('condition', 'A');
const REPS = Number(arg('reps', 10));
const START = Number(arg('start', 1));
const WORKERS = Number(arg('workers', 4));
const BROWSERS = arg('browsers', 'chromium');
const PORT = Number(arg('port', 4173));
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = arg('out', 'results');
const CHROME_PATH = process.env.CHROME_PATH || '/usr/local/bin/chromium';

// Frozen workload envelope (AC-4). Changing these invalidates comparability.
const ENVELOPE = {
  latencyBase: 80,
  latencySpread: 240,
  renderDelay: 100,
  fixedWaitMs: 800,
  workers: WORKERS,
  browsers: BROWSERS,
  reps: REPS,
  condition: CONDITION,
};

const CONDITIONS = {
  // A: pre-contribution baseline policy - fixed sleeps, one shared account.
  A: { harness: 'fixed-sleep', isolation: 'shared' },
  // B: auto-waiting reference, still on a shared account and shared data.
  B: { harness: 'candidate', isolation: 'shared' },
  // C: complete system - auto-waiting plus per-worker state isolation.
  C: { harness: 'candidate', isolation: 'per-worker' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function health() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE_URL}/_health`);
      if (res.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error('SUT did not become healthy');
}

async function control(body) {
  await fetch(`${BASE_URL}/_control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function resetAccounts() {
  for (let i = 1; i <= 8; i++) {
    await fetch(`${BASE_URL}/_reset/u${i}`, { method: 'POST' }).catch(() => {});
  }
}

function runChild(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

// ---------------------------------------------------------------- main
const spec = CONDITIONS[CONDITION];
if (!spec) {
  console.error(`unknown condition ${CONDITION}; expected A, B or C`);
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonl = path.join(OUT_DIR, `${CONDITION}.jsonl`);
if (START === 1) {
  // A campaign always begins from a clean evidence file for that condition.
  fs.writeFileSync(jsonl, '');
  const manifestPath = path.join(OUT_DIR, 'manifest.jsonl');
  if (fs.existsSync(manifestPath)) {
    const kept = fs
      .readFileSync(manifestPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        try { return JSON.parse(line).condition !== CONDITION; } catch { return true; }
      });
    fs.writeFileSync(manifestPath, kept.join('\n') + (kept.length ? '\n' : ''));
  }
}

const sut = spawn('node', ['sut/server.js'], {
  env: { ...process.env, SUT_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let sutLog = '';
sut.stdout.on('data', (d) => (sutLog += d));
sut.stderr.on('data', (d) => (sutLog += d));

try {
  await health();
  await control({
    latencyBase: ENVELOPE.latencyBase,
    latencySpread: ENVELOPE.latencySpread,
    renderDelay: ENVELOPE.renderDelay,
    failRate: 0,
  });

  for (let run = START; run < START + REPS; run++) {
    await resetAccounts();
    const started = Date.now();
    let result;
    if (spec.harness === 'fixed-sleep') {
      result = await runChild('node', ['harness/fixed-sleep/run.mjs'], {
        CONDITION,
        RUN_ID: String(run),
        JSONL_OUT: jsonl,
        WORKERS: String(WORKERS),
        BROWSERS,
        FIXED_WAIT: String(ENVELOPE.fixedWaitMs),
        BASE_URL,
        CHROME_PATH,
      });
    } else {
      result = await runChild(
        'npx',
        ['playwright', 'test', '--config', 'harness/candidate/playwright.config.mjs'],
        {
          CONDITION,
          RUN_ID: String(run),
          PW_JSONL: jsonl,
          PW_OUTPUT_DIR: path.join(OUT_DIR, 'artifacts', CONDITION, `run-${run}`),
          ISOLATION: spec.isolation,
          WORKERS: String(WORKERS),
          BROWSERS,
          BASE_URL,
          CHROME_PATH,
        }
      );
    }
    const durationMs = Date.now() - started;
    const manifest = {
      condition: CONDITION,
      run,
      startedAt: new Date(started).toISOString(),
      durationMs,
      exitCode: result.code,
      envelope: ENVELOPE,
      harness: spec.harness,
      isolation: spec.isolation,
    };
    fs.appendFileSync(path.join(OUT_DIR, 'manifest.jsonl'), JSON.stringify(manifest) + '\n');
    const tail = result.out.trim().split('\n').slice(-1)[0] || '';
    console.log(`[${CONDITION}] run ${run}/${START + REPS - 1} ${durationMs}ms  ${tail.slice(0, 90)}`);
  }
} finally {
  sut.kill('SIGTERM');
  await sleep(300);
  sut.kill('SIGKILL');
}

console.log(`\ncondition ${CONDITION}: ${REPS} repetitions written to ${jsonl}`);
