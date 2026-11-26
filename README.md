# Deterministic Cross-Browser End-to-End Test Automation

Reference implementation, differentiating contribution and acceptance harness for a
two-semester capstone in the Cloud and Edge Systems domain.

## What is here

| Path | What it is |
|---|---|
| `sut/` | Instrumented application under test: async rendering, a hydration window, cookie auth, per-user server-side state, latency and fault injection control surface |
| `harness/fixed-sleep/` | Condition A: the pre-contribution baseline policy (fixed sleeps, one shared account) |
| `harness/candidate/` | Conditions B and C: Playwright auto-waiting suite; `ISOLATION=shared|per-worker` switches the contribution on and off |
| `scripts/campaign.mjs` | Runs one condition for N repetitions against freshly seeded state |
| `scripts/analyze.mjs` | Computes flakiness rate, run-level rate, Wilson intervals, contrasts; writes `results/summary.md` |
| `infra/terraform/` | AWS testbed: ECR, Fargate cluster, S3 evidence store, CloudWatch, FIS experiment |
| `docs/aws-architecture.md` | Where AWS belongs in the project and why |
| `docs/RESULTS.md` | Latest measured campaign results |
| `docs/evidence-manifest.md` | Evidence register (D1–D7 mapping) |

## Quick start

```bash
npm ci
npx playwright install chromium firefox webkit   # all three engines
node scripts/campaign.mjs --condition A --reps 10 --workers 4
node scripts/campaign.mjs --condition B --reps 10 --workers 4
node scripts/campaign.mjs --condition C --reps 10 --workers 4
node scripts/analyze.mjs results
```

In a constrained container without Playwright's bundled browsers, point the harness at a
system Chromium: `CHROME_PATH=/usr/local/bin/chromium`.

## The three conditions

- **A** fixed sleeps after every interaction, one shared account, shared data namespace.
- **B** state-based auto-waiting, still one shared account (isolates the wait policy).
- **C** auto-waiting plus per-worker authentication and per-test data isolation (the O3
  contribution).

A → B measures the reference; B → C measures the contribution on identical code.

## Frozen envelope (AC-4)

`latencyBase=80 ms`, `latencySpread=240 ms`, `renderDelay=100 ms`, `fixedWaitMs=800`,
4 workers, Chromium/Firefox/WebKit, pinned dependency versions. Change any of these and
the conditions are no longer comparable; the campaign records the envelope in
`results/manifest.jsonl` for every repetition.
