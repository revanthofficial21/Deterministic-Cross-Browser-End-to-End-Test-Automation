# Deterministic Cross-Browser End-to-End Test Automation

Reference implementation, differentiating contribution and acceptance harness for a
two-semester capstone project in the Cloud and Edge Systems domain.

Browser end-to-end tests are the most valuable tests a web team has and the ones most
likely to be deleted, because asynchronous rendering, variable network timing and shared
authentication state make them fail intermittently until nobody trusts them. This
repository builds a test-execution system that makes that failure mode measurable,
removes it where it can be removed, and makes the residue diagnosable.

**Status:** the reference and the contribution are implemented and measured on one engine
at reduced scale. The three-engine campaign runs in CI. The full KPI contract is not yet
discharged — see [Status and limitations](#status-and-limitations).

---

## Measured result

Three conditions, identical workload and frozen resource envelope, 8 test cases,
repetitions seeded from clean state:

| Condition | Reps | Flaky tests | Flakiness rate F (95% CI) | Run-level | Execution failures | Mean suite duration |
|---|---|---|---|---|---|---|
| **A** fixed sleeps, shared account | 8 | 4 / 8 | **50.0%** [21.5, 78.5] | 100.0% | 42.2% | 17.8 s |
| **B** auto-waiting, shared account | 6 | 1 / 8 | **12.5%** [2.2, 47.1] | 16.7% | 2.1% | 62.0 s |
| **C** auto-waiting, isolated accounts | 6 | 0 / 8 | **0.0%** [0.0, 32.4] | 0.0% | 0.0% | 59.5 s |

- **A → B** isolates the wait policy: replacing clock-based with state-based
  synchronisation removes 75% of the flakiness rate.
- **B → C** isolates the contribution: per-worker authentication and per-test data
  isolation remove the residual failure, which the trace showed to be a shared-account
  settings collision.
- The single failure that survived B and was diagnosed from its trace turned out to be a
  defect in the *test's own* synchronisation model — it waited on `toBeEnabled()` when the
  correct condition was the hydration flag. That is the evidence path working, and it is
  why condition C's zero is interpretable rather than lucky.

Charts: [`results/figures/`](results/figures) — flakiness with confidence intervals,
execution-level failures, per-test heatmap, suite duration, one-page dashboard.
Annotated screenshots of every application state: [`results/figures/fig01…fig08`](results/figures).

---

## The problem, decomposed

| Defect | Signature | Remedy in this repository |
|---|---|---|
| **Synchronisation** — the test acts on state that is not yet stable | failure position varies across runs; correlates with render or network latency | state-based auto-waiting: actionability predicates, render and network gating, retrying assertions |
| **State coupling** — an outcome depends on another test's state | fails under parallelism, passes in isolation; the victim is not the culprit | per-worker signed-in state, per-test data namespace, account pool, reconciliation |
| **Evidence insufficiency** — the failure cannot be explained after the fact | only re-running helps, and re-running often does not reproduce | per-execution trace bundles plus a rubric that scores diagnostic sufficiency |

## Architecture

Three planes, each separately testable — which is what makes the B → C ablation possible.

```
control plane     test authoring · orchestration (workers, sharding, retries) · isolation
execution plane   auto-wait driver · browser engines · trace recorder
evidence plane    trace bundles · run manifests · diagnosis and rubric scoring
```

## Repository layout

| Path | What it is |
|---|---|
| `sut/` | Instrumented application under test: async fetch, deferred render, a hydration window, cookie auth, per-user server-side state, and a control surface for latency and fault injection |
| `harness/fixed-sleep/` | **Condition A** — the pre-contribution baseline policy: fixed sleeps after every interaction, one shared account, shared data namespace |
| `harness/candidate/` | **Conditions B and C** — Playwright suite with auto-waiting; `ISOLATION=shared\|per-worker` switches the contribution on and off on identical code |
| `scripts/campaign.mjs` | Runs one condition for N repetitions against freshly seeded state, writes per-test JSONL plus a manifest line per repetition |
| `scripts/analyze.mjs` | Flakiness rate, run-level rate, Wilson intervals, A→B→C contrasts; writes `results/summary.{json,md}` and `results/flakiness.csv` |
| `scripts/capture.mjs` | Screenshots every application state, including the hydration window and the fixed-sleep assertion window |
| `scripts/make_figures.py` | Annotates the screenshots and renders the result charts |
| `infra/terraform/` | AWS testbed: ECR, Fargate cluster, task definitions, S3 evidence store, CloudWatch, FIS experiment template |
| `docs/paper.pdf`, `docs/paper.docx` | The research paper (15 pages, 11 tables, 2 figures, 24 references) |
| `docs/RESULTS.md` | Full campaign output, per-test detail |
| `docs/aws-architecture.md` | Where AWS belongs in the project, and what it costs |
| `docs/evidence-manifest.md` | Evidence register: every claim mapped to a retained artefact |
| `.github/workflows/campaign.yml` | Three-engine campaign: A, B, C in parallel, then analysis |

---

## Quick start

Requires Node 20+.

```bash
npm ci
npx playwright install chromium firefox webkit

# one condition at a time; each starts the SUT itself and tears it down
node scripts/campaign.mjs --condition A --reps 10 --workers 4
node scripts/campaign.mjs --condition B --reps 10 --workers 4
node scripts/campaign.mjs --condition C --reps 10 --workers 4

node scripts/analyze.mjs results      # writes results/summary.md and prints it
```

In a container without Playwright's bundled browsers, drive a system Chromium instead:

```bash
CHROME_PATH=/usr/local/bin/chromium node scripts/campaign.mjs --condition C --reps 5
```

Reproduce the visual evidence:

```bash
LATENCY_BASE=300 LATENCY_SPREAD=400 ./scripts/with-sut.sh node scripts/capture.mjs
python scripts/make_figures.py        # annotates screenshots, renders charts
```

## The three conditions

| | Waiting | Authentication | Data namespace | Isolates |
|---|---|---|---|---|
| **A** | fixed sleep after every interaction | one shared account | shared | nothing — the pre-contribution state of the art |
| **B** | state-based auto-waiting | one shared account | shared | the wait policy only |
| **C** | state-based auto-waiting | one account per parallel worker | unique per test | the contribution |

A → B measures the reference. B → C measures the contribution on identical code, so the
comparison is not confounded by framework choice.

## Metrics

For a test suite `T` executed `n` times against one version of the application:

```
F = |{ t ∈ T : 0 < f(t) < n }| / |T|        test-level flakiness rate
run-level = share of suite executions with at least one failure
```

Both are reported with Wilson 95% intervals. `F` is monotone in `n`, so `n` is always
reported with it — a rate without `n` is not interpretable.

## Frozen envelope (AC-4)

| Parameter | Value |
|---|---|
| Latency per API call | 80 ms base + U(0, 240) ms |
| Deferred render delay | 100 ms |
| Fixed wait (condition A only) | 800 ms |
| Workers | 4 |
| Engines | Chromium, Firefox, WebKit (sandbox campaign: Chromium only) |

Changing any of these makes conditions incomparable. Every repetition records the
envelope it ran under in `results/manifest.jsonl`.

## Running the three-engine campaign in CI

The workflow is **manual dispatch only**, so nothing burns minutes on push.

> **Actions → acceptance-campaign → Run workflow**

| Input | Suggested first run | Full campaign |
|---|---|---|
| `reps` | `3` | `50` |
| `browsers` | `chromium,firefox,webkit` | `chromium,firefox,webkit` |

The job matrix runs conditions A, B and C in parallel, uploads per-test evidence, then a
dependent job merges the artefacts, computes the rates and publishes the summary to the
run page.

## AWS testbed

The project is classified Cloud and Edge Systems, and the charter asks for an isolated
container or cluster testbed with workload generation, telemetry and fault injection. AWS
is used for the **campaign**, not to host the application: Fargate tasks per condition
with pinned CPU and memory, S3 for trace bundles, CloudWatch for telemetry, and Fault
Injection Service for NT-1 and NT-5.

```bash
cd infra/terraform
terraform init
terraform apply -var="sut_image=<ecr>@sha256:…" -var="campaign_image=<ecr>@sha256:…"
```

See [`docs/aws-architecture.md`](docs/aws-architecture.md) for the mapping, the cost shape
and the security model (OIDC, private subnets, SSE-KMS). Nothing here has been applied to
a live account.

## Status and limitations

Measured and reproducible:

- flakiness rate, run-level rate and execution failure rate for all three conditions
- per-test failure detail (`results/flakiness.csv`)
- mean suite duration, the cost side of the determinism trade

Not yet measured, and deliberately left blank rather than estimated:

- **cross-browser consistency** — needs the three engines; the container this was built in
  runs Chromium only
- **diagnosis score** — the rubric is defined and one failure was scored; two independent
  human raters are required by the protocol
- **recovery rate, load-level error rate, latency p95** — need the fault-injection
  campaign and a load generator

Known caveats:

- Repetition counts are small (8 / 6 / 6), so the intervals are wide and the contribution's
  effect is not separated from zero at this scale. The CI campaign exists to narrow them.
- 8 of the 27 failures recorded in condition A are navigation-interruption errors raised by
  the baseline policy itself. Recomputing A without them leaves 25.0% of test cases flaky,
  so the direction of the result does not depend on the artefact.
- `sut/public/app.js` accepts `?hydrateDelay=<ms>`, which widens the window between paint
  and interactivity so the window can be photographed. It changes how long the window
  lasts, not what happens in it.

## Documentation

| Document | Contents |
|---|---|
| [`docs/paper.pdf`](docs/paper.pdf) | Research paper: architecture, protocol, pre-registered KPIs, measured campaign |
| [`docs/RESULTS.md`](docs/RESULTS.md) | Campaign output with per-test detail |
| [`docs/aws-architecture.md`](docs/aws-architecture.md) | AWS mapping, cost, security, deployment order |
| [`docs/evidence-manifest.md`](docs/evidence-manifest.md) | Every claim mapped to the artefact that supports it |

## Author

Mr. RK — Department of Computer Science and Engineering.
Capstone Project (CP1 + CP2), Semester VII and Semester VIII.
