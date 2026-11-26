// Diagnosis scoring: the rubric that makes "diagnosable without re-running" a
// measured quantity instead of a claim (KPI-3).
//
// The rubric has five observable criteria, each worth 20 points, with anchors at
// 0, 50, 80 and 100 so that two independent raters can score the same bundle and
// their agreement can be reported. The rubric is frozen: it is defined here, before
// the system it scores is tuned, and the weights do not move.
//
// Usage
//   node scripts/diagnose.mjs <trace.zip> [more.zip ...]   score real bundles
//   node scripts/diagnose.mjs --sheet results/artifacts    write the rater sheet
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const RUBRIC = [
  {
    id: 'failing_step',
    criterion: 'The failing step is identifiable',
    weight: 20,
    anchors: {
      0: 'no action log; the failure position is unknown',
      50: 'the failing test is known but not the step',
      80: 'the failing action and its locator are visible in the action log',
      100: 'the failing action, its locator, its duration and the moment of failure are all visible',
    },
  },
  {
    id: 'state_at_failure',
    criterion: 'The application state at the moment of failure is visible',
    weight: 20,
    anchors: {
      0: 'no snapshot or screenshot',
      50: 'a screenshot of the end state only',
      80: 'a DOM snapshot at the failing action',
      100: 'DOM snapshots before, during and after the failing action',
    },
  },
  {
    id: 'causal_sequence',
    criterion: 'The causal sequence leading to the failure is recoverable',
    weight: 20,
    anchors: {
      0: 'no network or console evidence',
      50: 'either network or console, not both',
      80: 'network and console, time-aligned to the actions',
      100: 'network and console time-aligned, with the request that produces the asserted state identifiable',
    },
  },
  {
    id: 'product_vs_test',
    criterion: 'The evidence supports deciding whether the defect is in the product or in the test',
    weight: 20,
    anchors: {
      0: 'the failure is indistinguishable from a product error',
      50: 'a suspicion, not supported by the artefacts',
      80: 'the artefacts distinguish a product defect from a test defect',
      100: 'the artefacts name which side is at fault and what the correct behaviour would have been',
    },
  },
  {
    id: 'no_rerun',
    criterion: 'The failure can be explained without re-executing it',
    weight: 20,
    anchors: {
      0: 're-execution is required',
      50: 'partially: some questions need a rerun',
      80: 'the cause can be stated from the artefacts alone',
      100: 'the cause and the fix can be stated from the artefacts alone',
    },
  },
];

const VERDICT = (score, missing) => {
  // Nothing to diagnose from: refuse, do not guess. This is checked before the
  // telemetry-gap case, because a total absence of evidence is not a partial gap.
  if (score === 0) return 'insufficient_evidence';
  if (missing.length > 0) return 'telemetry_gap';
  return score >= 80 ? 'diagnosed' : score >= 50 ? 'partial' : 'insufficient_evidence';
};

// Inspect a real trace bundle. A Playwright trace is a zip with a known shape:
//   trace.trace / trace.network / trace.stacks  and resources/ for snapshots.
export function inspectBundle(tracePath) {
  const present = { actionLog: false, network: false, console: false, snapshots: false, source: false };
  try {
    const listing = execFileSync('unzip', ['-l', tracePath], { encoding: 'utf8' });
    const names = listing.split('\n').map((l) => l.trim().split(/\s+/).slice(-1)[0]);
    present.actionLog = names.some((n) => /trace\.trace$|\.trace$/.test(n));
    present.network = names.some((n) => /trace\.network$/.test(n));
    present.console = present.actionLog; // console events are carried in the action stream
    present.snapshots = names.some((n) => /resources\//.test(n));
    present.source = names.some((n) => /trace\.stacks$|trace\.source/.test(n));
  } catch {
    return { present, missing: RUBRIC.map((r) => r.id), score: 0, verdict: 'insufficient_evidence', namedCause: null };
  }

  const criteria = {
    failing_step: present.actionLog ? 20 : 0,
    state_at_failure: present.snapshots ? 20 : 0,
    causal_sequence: present.network && present.console ? 20 : present.network || present.console ? 10 : 0,
    product_vs_test: present.network && present.snapshots ? 20 : present.network || present.snapshots ? 10 : 0,
    no_rerun: present.actionLog && present.network && present.snapshots ? 20 : present.actionLog ? 10 : 0,
  };
  return finish(criteria, present);
}

function finish(criteria, present) {
  const missing = [];
  if (!present.actionLog) missing.push('failing_step');
  if (!present.snapshots) missing.push('state_at_failure');
  if (!present.network) missing.push('causal_sequence');
  const score = Object.values(criteria).reduce((a, b) => a + b, 0);
  return {
    score,
    criteria,
    missing,
    verdict: VERDICT(score, missing),
    // A cause is named only when the evidence can carry it.
    namedCause: score >= 80 && missing.length === 0 ? 'supported_by_artefacts' : null,
    present,
  };
}

// Deterministic stand-ins used by NT-3 and NT-4, where the point is what the scorer
// does when evidence is absent or incomplete rather than what a real bundle holds.
export async function scoreBundle(options = {}) {
  const { simulate } = options;
  if (simulate === 'complete') {
    return finish(
      { failing_step: 20, state_at_failure: 20, causal_sequence: 20, product_vs_test: 20, no_rerun: 20 },
      { actionLog: true, network: true, console: true, snapshots: true, source: true }
    );
  }
  if (simulate === 'no-artefacts') {
    return finish(
      { failing_step: 0, state_at_failure: 0, causal_sequence: 0, product_vs_test: 0, no_rerun: 0 },
      { actionLog: false, network: false, console: false, snapshots: false, source: false }
    );
  }
  if (simulate === 'no-network') {
    return finish(
      { failing_step: 20, state_at_failure: 20, causal_sequence: 10, product_vs_test: 10, no_rerun: 10 },
      { actionLog: true, network: false, console: true, snapshots: true, source: true }
    );
  }
  throw new Error(`unknown simulation: ${simulate}`);
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args[0] === '--sheet') {
    let md = `# Diagnosis rubric and rater sheet (KPI-3)\n\n`;
    md += `Frozen before measurement. Five criteria, 20 points each, total 100. Two independent raters\n`;
    md += `score each bundle; report the mean and the agreement, not a single number.\n\n`;
    md += `| Criterion | Weight | Anchor 0 | Anchor 50 | Anchor 80 | Anchor 100 |\n|---|---|---|---|---|---|\n`;
    for (const c of RUBRIC) {
      md += `| ${c.criterion} | ${c.weight} | ${c.anchors[0]} | ${c.anchors[50]} | ${c.anchors[80]} | ${c.anchors[100]} |\n`;
    }
    md += `\n## Score sheet\n\n| Bundle | Rater A | Rater B | Mean | Agreement | Cause named |\n|---|---|---|---|---|---|\n`;
    md += `| (fill per bundle) | | | | | |\n`;
    fs.writeFileSync('results/DIAGNOSIS-RUBRIC.md', md);
    console.log('wrote results/DIAGNOSIS-RUBRIC.md');
    process.exit(0);
  }

  if (args.length === 0) {
    console.log('usage: node scripts/diagnose.mjs <trace.zip ...> | --sheet');
    process.exit(2);
  }

  let total = 0;
  let scored = 0;
  for (const file of args) {
    if (!fs.existsSync(file)) {
      console.log(`${file}: not found`);
      continue;
    }
    const r = inspectBundle(file);
    total += r.score;
    scored += 1;
    console.log(`\n${path.basename(file)}`);
    console.log(`  score      ${r.score}/100`);
    console.log(`  verdict    ${r.verdict}`);
    for (const [k, v] of Object.entries(r.criteria)) console.log(`    ${k.padEnd(18)} ${v}`);
    if (r.missing.length) console.log(`  missing    ${r.missing.join(', ')}`);
  }
  if (scored > 1) console.log(`\nmean score ${(total / scored).toFixed(1)}/100 over ${scored} bundles`);
}
