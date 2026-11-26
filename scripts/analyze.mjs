// Flakiness analysis.
//
// Implements the metric definitions from the paper:
//   * test-level flakiness rate  F = |{t : 0 < f(t) < n}| / |T|
//   * run-level flakiness rate   proportion of suite executions with >= 1 failure
//   * cross-browser consistency  proportion of tests with identical outcome in all
//                                engines within a repetition
// All rates are reported with Wilson score intervals at 95%.
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = process.argv[2] || 'results';

function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const conditions = ['A', 'B', 'C'].filter((c) => fs.existsSync(path.join(OUT_DIR, `${c}.jsonl`)));
const summary = { generatedAt: new Date().toISOString(), conditions: {} };

for (const condition of conditions) {
  const records = readJsonl(path.join(OUT_DIR, `${condition}.jsonl`));
  const runs = [...new Set(records.map((r) => r.run))].sort((a, b) => a - b);
  const tests = [...new Set(records.map((r) => r.test))];

  // per-test failure counts
  const perTest = tests.map((t) => {
    const rs = records.filter((r) => r.test === t);
    const n = rs.length;
    const fails = rs.filter((r) => r.status !== 'passed').length;
    return {
      test: t,
      n,
      fails,
      failureRate: n ? fails / n : 0,
      flaky: n > 0 && fails > 0 && fails < n,
      alwaysFailing: n > 0 && fails === n,
      [Symbol.for('errors')]: rs.filter((r) => r.error).map((r) => r.error),
    };
  });

  const flakyCount = perTest.filter((t) => t.flaky).length;
  const [F, F_lo, F_hi] = wilson(flakyCount, perTest.length);

  // run-level
  const runStats = runs.map((run) => {
    const rs = records.filter((r) => r.run === run);
    return { run, tests: rs.length, fails: rs.filter((r) => r.status !== 'passed').length };
  });
  const runsWithFailure = runStats.filter((r) => r.fails > 0).length;
  const [R, R_lo, R_hi] = wilson(runsWithFailure, runStats.length);

  // execution-level failure rate (for context, not the primary metric)
  const totalExec = records.length;
  const totalFails = records.filter((r) => r.status !== 'passed').length;

  // cross-browser consistency (only meaningful with >1 browser)
  const browsers = [...new Set(records.map((r) => r.browser))];
  let consistency = null;
  if (browsers.length > 1) {
    let same = 0;
    let total = 0;
    for (const run of runs) {
      for (const t of tests) {
        const rs = records.filter((r) => r.run === run && r.test === t);
        const statuses = new Set(rs.map((r) => r.status));
        if (statuses.size === 0) continue;
        total += 1;
        if (statuses.size === 1) same += 1;
      }
    }
    const [c, lo, hi] = wilson(same, total);
    consistency = { rate: c, lo, hi, samples: total };
  }

  const manifest = readJsonl(path.join(OUT_DIR, 'manifest.jsonl')).filter((m) => m.condition === condition);
  const meanDurationMs = manifest.length
    ? Math.round(manifest.reduce((a, m) => a + m.durationMs, 0) / manifest.length)
    : null;

  summary.conditions[condition] = {
    repetitions: runs.length,
    tests: perTest.length,
    executions: totalExec,
    executionFailureRate: totalExec ? totalFails / totalExec : 0,
    flakinessRate: F,
    flakinessCI: [F_lo, F_hi],
    flakyTests: flakyCount,
    alwaysFailingTests: perTest.filter((t) => t.alwaysFailing).length,
    runLevelRate: R,
    runLevelCI: [R_lo, R_hi],
    runsWithFailure,
    crossBrowserConsistency: consistency,
    browsers,
    meanSuiteDurationMs: meanDurationMs,
    perTest: perTest.map((t) => ({
      test: t.test,
      n: t.n,
      fails: t.fails,
      failureRate: Number(t.failureRate.toFixed(4)),
      flaky: t.flaky,
      alwaysFailing: t.alwaysFailing,
      sampleError: (t[Symbol.for('errors')] || [])[0] || null,
    })),
  };
}

// ---------------------------------------------------------------- markdown
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pctCI = (c, lo, hi) => `${pct(c)} [${pct(lo)}, ${pct(hi)}]`;

let md = `# Flakiness campaign summary\n\nGenerated ${summary.generatedAt}\n\n`;
md += `Metric definitions: F = |{t : 0 < f(t) < n}| / |T|; run-level = proportion of suite executions with at least one failure. Intervals are Wilson 95%.\n\n`;
md += `| Condition | Reps | Tests | Flaky tests | F (95% CI) | Run-level (95% CI) | Exec failure rate | Cross-browser consistency | Mean suite duration |\n`;
md += `|---|---|---|---|---|---|---|---|---|\n`;
for (const [c, d] of Object.entries(summary.conditions)) {
  md += `| ${c} | ${d.repetitions} | ${d.tests} | ${d.flakyTests} | ${pctCI(d.flakinessRate, ...d.flakinessCI)} | ${pctCI(d.runLevelRate, ...d.runLevelCI)} | ${pct(d.executionFailureRate)} | ${
    d.crossBrowserConsistency ? pct(d.crossBrowserConsistency.rate) : 'n/a'
  } | ${d.meanSuiteDurationMs ? `${(d.meanSuiteDurationMs / 1000).toFixed(1)} s` : 'n/a'} |\n`;
}
md += `\n## Per-test detail\n\n`;
for (const [c, d] of Object.entries(summary.conditions)) {
  md += `### Condition ${c}\n\n| Test | Executions | Failures | Failure rate | Flaky | First sample error |\n|---|---|---|---|---|---|\n`;
  for (const t of d.perTest) {
    md += `| ${t.test} | ${t.n} | ${t.fails} | ${pct(t.failureRate)} | ${t.flaky ? 'yes' : 'no'} | ${
      t.sampleError ? t.sampleError.replace(/\|/g, '\\|').slice(0, 90) : ''
    } |\n`;
  }
  md += `\n`;
}

// ---------------------------------------------------------------- contrasts
const A = summary.conditions.A;
const B = summary.conditions.B;
const C = summary.conditions.C;
md += `## Contrasts\n\n`;
const line = (label, from, to) => {
  if (!from || !to) return `- ${label}: not available\n`;
  const rel = from.flakinessRate === 0 ? null : (from.flakinessRate - to.flakinessRate) / from.flakinessRate;
  const dur = from.meanSuiteDurationMs && to.meanSuiteDurationMs
    ? ((to.meanSuiteDurationMs - from.meanSuiteDurationMs) / from.meanSuiteDurationMs) * 100
    : null;
  return `- ${label}: F ${pct(from.flakinessRate)} -> ${pct(to.flakinessRate)}${
    rel === null ? '' : ` (${(rel * 100).toFixed(1)}% relative reduction)`
  }; mean suite duration ${dur === null ? 'n/a' : `${dur >= 0 ? '+' : ''}${dur.toFixed(1)}%`}\n`;
};
md += line('A -> B (wait policy: fixed sleeps to auto-waiting)', A, B);
md += line('B -> C (contribution: per-worker state isolation)', B, C);
md += line('A -> C (complete system)', A, C);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), md);

// CSV for the report
let csv = 'condition,test,n,fails,failureRate,flaky\n';
for (const [c, d] of Object.entries(summary.conditions)) {
  for (const t of d.perTest) {
    csv += `${c},"${t.test}",${t.n},${t.fails},${t.failureRate},${t.flaky}\n`;
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'flakiness.csv'), csv);

console.log(md);
