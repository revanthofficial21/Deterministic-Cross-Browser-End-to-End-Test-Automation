# Deterministic Cross-Browser End-to-End Test Automation

### A Reference Implementation, Differentiating Contribution, and Acceptance Harness for a Two-Semester Capstone

**Domain:** Cloud and Edge Systems
---

## Overview

Browser end-to-end (E2E) tests are among the most valuable tests in a web development workflow, yet they are often the first tests developers stop trusting.

Asynchronous rendering, variable network latency, shared authentication state, and concurrent test execution introduce intermittent failures—commonly known as *flaky tests*. These failures make CI pipelines unreliable, increase debugging effort, and can lead to critical tests being disabled or deleted.

This project develops a deterministic E2E test-execution system that:

- Replaces fixed-time sleeps with state-based synchronization and auto-waiting.
- Eliminates shared-state interference through authentication and test-data isolation.
- Captures structured execution evidence for post-failure diagnosis.
- Measures test flakiness, execution failures, runtime overhead, and diagnostic quality.
- Provides a reproducible experimental framework for comparing baseline and improved testing strategies.
- Supports cross-browser acceptance campaigns using Chromium, Firefox, and WebKit.
- Integrates a cloud-based experimental testbed using AWS infrastructure.

The project evaluates three controlled experimental conditions to separate the impact of improved synchronization from the contribution of state isolation.

> **Current Status:** The reference implementation and differentiating contribution are implemented and measured at reduced scale on Chromium. The three-engine CI campaign is configured. The full KPI contract remains partially unvalidated.

---

## Key Results

Three experimental conditions were evaluated under an identical workload and frozen resource envelope.

| Condition | Strategy | Repetitions | Flaky Tests | Flakiness Rate | Run-Level Failure | Execution Failure Rate | Mean Duration |
|---|---|---:|---:|---:|---:|---:|
| **A** | Fixed sleeps + shared account | 8 | 4/8 | **50.0%** | 100.0% | 17.8 s |
| **B** | Auto-waiting + shared account | 6 | 1/8 | **12.5%** | 16.7% | 62.0 s |
| **C** | Auto-waiting + isolated accounts | 6 | 0/8 | **0.0%** | 0.0% | 59.5 s |

### Flakiness Rate — Wilson 95% Confidence Interval

| Condition | Flakiness Rate | 95% CI |
|---|---:|---:|
| A | 50.0% | [21.5%, 78.5%] |
| B | 12.5% | [2.2%, 47.1%] |
| C | 0.0% | [0.0%, 32.4%] |

### Experimental Findings

**A → B: Synchronization improvement**

Replacing fixed-time sleeps with state-based auto-waiting reduced the observed test-level flakiness rate from 50.0% to 12.5%, a relative reduction of 75%.

**B → C: State-isolation contribution**

Enabling per-worker authentication and per-test data isolation removed the remaining observed flaky test. Trace analysis identified shared-account settings interference as the cause.

**Failure diagnosis**

The failure that persisted under Condition B exposed an incorrect synchronization assumption within the test itself. The test waited for `toBeEnabled()` when the correct synchronization condition was the application's hydration flag.

This demonstrates the value of execution traces in identifying synchronization defects rather than relying on repeated execution alone.

> The observed results are preliminary. The repetition counts are small, and confidence intervals are wide. These results indicate the direction of improvement but do not establish statistical significance.

---

## Problem Statement

Traditional E2E test automation is vulnerable to three major failure categories.

| Failure Category | Description | Proposed Solution |
|---|---|---|
| **Synchronization failures** | Tests interact with elements before the application reaches a stable state | State-based auto-waiting, actionability checks, rendering synchronization, and retrying assertions |
| **State coupling** | Tests interfere with each other through shared authentication or application data | Per-worker authentication, isolated test-data namespaces, account pooling, and state reconciliation |
| **Evidence insufficiency** | Failures cannot be diagnosed from logs or screenshots alone | Per-execution trace bundles, run manifests, diagnostic rubric, and structured evidence collection |

---

## Objectives

1. Develop a reproducible reference implementation for browser E2E test automation.
2. Replace unreliable fixed-delay synchronization with state-aware execution.
3. Implement authentication and test-data isolation for parallel workers.
4. Design controlled experiments that independently evaluate synchronization and isolation.
5. Quantify flakiness, execution failures, runtime, and confidence intervals.
6. Capture diagnostic evidence for every test execution.
7. Implement a cross-browser campaign across Chromium, Firefox, and WebKit.
8. Design a cloud-based campaign testbed using containerized workloads, telemetry, and fault injection.
9. Maintain a transparent evidence register mapping research claims to reproducible artifacts.

---

## Architecture

The system is divided into three independently testable planes.

```text
┌──────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                        │
│                                                          │
│  Test Authoring │ Orchestration │ Sharding │ Isolation   │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                   EXECUTION PLANE                       │
│                                                          │
│  Auto-Wait Driver │ Browser Engines │ Trace Recorder    │
│                                                          │
│  Chromium │ Firefox │ WebKit                             │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                    EVIDENCE PLANE                        │
│                                                          │
│  Trace Bundles │ Run Manifests │ Diagnosis │ KPI Analysis│
└──────────────────────────────────────────────────────────┘
```

### Control Plane

Responsible for:

- Test authoring and configuration.
- Campaign orchestration.
- Worker allocation.
- Test sharding.
- Retry policies.
- Authentication isolation.
- Test-data namespace management.

### Execution Plane

Responsible for:

- State-based synchronization.
- Browser interaction.
- Cross-browser execution.
- Application state observation.
- Trace and screenshot recording.

### Evidence Plane

Responsible for:

- Per-execution trace bundles.
- Run manifests.
- Failure diagnostics.
- Evidence completeness evaluation.
- KPI calculation and reporting.

---

## Experimental Design

The experiment uses three conditions with the same test workload.

| Condition | Waiting Strategy | Authentication | Data Namespace | Purpose |
|---|---|---|---|---|
| **A — Baseline** | Fixed sleeps | Shared account | Shared | Establish baseline behavior |
| **B — Synchronization** | State-based auto-waiting | Shared account | Shared | Isolate synchronization improvement |
| **C — Contribution** | State-based auto-waiting | Per-worker accounts | Unique per test | Measure the isolation contribution |

### Controlled Comparison

- **A → B:** Evaluates the effect of the waiting policy.
- **B → C:** Evaluates the effect of authentication and data isolation.
- Conditions B and C use the same candidate implementation, with isolation enabled or disabled through configuration.

This design minimizes experimental confounding and enables contribution-level evaluation.

---

## Metrics

Let:

- \(T\) be the set of test cases.
- \(n\) be the number of repetitions.
- \(f(t)\) be the number of failed executions of test \(t\).

### Test-Level Flakiness Rate

A test is classified as flaky if it passes in some executions and fails in others.

\[
F = \frac{|\{t \in T : 0 < f(t) < n\}|}{|T|}
\]

### Run-Level Failure Rate

The proportion of complete suite executions containing at least one failure.

\[
R = \frac{\text{Suite runs with at least one failure}}{\text{Total suite runs}}
\]

### Execution Failure Rate

The proportion of individual test executions that fail.

\[
E = \frac{\text{Failed test executions}}{\text{Total test executions}}
\]

### Additional Metrics

- Mean suite execution duration.
- Per-test failure frequency.
- Flakiness confidence intervals.
- Cross-browser consistency.
- Diagnostic sufficiency score.
- Recovery rate.
- Load-level error rate.
- Latency p95.

Flakiness and run-level rates are reported with Wilson 95% confidence intervals.

> Flakiness rate depends on the number of repetitions. Therefore, repetition count must always be reported alongside the rate.

---

## Frozen Experimental Envelope

The following parameters are held constant across experimental conditions.

| Parameter | Configuration |
|---|---|
| API latency | 80 ms base + uniform random delay of 0–240 ms |
| Deferred rendering | 100 ms |
| Fixed wait | 800 ms — Condition A only |
| Parallel workers | 4 |
| Browser engines | Chromium, Firefox, WebKit |
| Measured sandbox engine | Chromium |
| Application | Instrumented SUT |
| Repetition state | Freshly seeded state |

Changing these parameters invalidates direct comparisons between conditions.

Each campaign repetition records its experimental envelope in `results/manifest.jsonl`.

---

## Repository Structure

```text
.
├── sut/
│   └── Instrumented application under test
│
├── harness/
│   ├── fixed-sleep/
│   │   └── Condition A: baseline automation
│   │
│   └── candidate/
│       └── Conditions B and C: Playwright automation
│
├── scripts/
│   ├── campaign.mjs
│   ├── analyze.mjs
│   ├── capture.mjs
│   └── make_figures.py
│
├── infra/
│   └── terraform/
│       └── AWS experimental testbed
│
├── docs/
│   ├── paper.pdf
│   ├── paper.docx
│   ├── RESULTS.md
│   ├── aws-architecture.md
│   └── evidence-manifest.md
│
├── results/
│   ├── figures/
│   ├── summary.json
│   ├── summary.md
│   └── flakiness.csv
│
└── .github/
    └── workflows/
        └── campaign.yml
```

### Component Description

| Component | Responsibility |
|---|---|
| `sut/` | Instrumented application with asynchronous API calls, deferred rendering, hydration, cookie authentication, server-side user state, latency controls, and fault injection |
| `harness/fixed-sleep/` | Baseline test strategy using fixed sleeps, shared account, and shared data |
| `harness/candidate/` | Playwright auto-waiting implementation with configurable isolation |
| `scripts/campaign.mjs` | Executes campaigns, seeds fresh state, manages repetitions, and writes execution records |
| `scripts/analyze.mjs` | Computes flakiness, run-level failure rate, Wilson intervals, comparisons, and summaries |
| `scripts/capture.mjs` | Captures application states and synchronization windows |
| `scripts/make_figures.py` | Annotates screenshots and generates research charts |
| `infra/terraform/` | AWS testbed provisioning |
| `docs/paper.pdf` | Research paper |
| `docs/RESULTS.md` | Detailed campaign results |
| `docs/aws-architecture.md` | Cloud architecture, cost model, and security |
| `docs/evidence-manifest.md` | Evidence register for research claims |
| `.github/workflows/campaign.yml` | Three-engine CI acceptance campaign |

---

## Technology Stack

| Category | Technologies |
|---|---|
| Test Automation | Playwright |
| Runtime | Node.js 20+ |
| Frontend | Instrumented web application |
| Backend | API server and server-side application state |
| Authentication | Cookie-based authentication |
| Database | Application state persistence |
| Real-Time/Concurrency | Parallel workers and isolated namespaces |
| Cloud Infrastructure | AWS |
| Containers | Amazon ECS / AWS Fargate |
| Container Registry | Amazon ECR |
| Object Storage | Amazon S3 |
| Monitoring | Amazon CloudWatch |
| Fault Injection | AWS Fault Injection Service |
| Infrastructure as Code | Terraform |
| CI/CD | GitHub Actions |
| Analysis | Node.js, Python |
| Visualization | Python plotting and screenshot annotation |

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Playwright
- Chromium, Firefox, and WebKit browser dependencies

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-directory>
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Install Browser Engines

```bash
npx playwright install chromium firefox webkit
```

### 4. Run the Experimental Conditions

Each condition starts the application, executes the campaign, and tears down the environment.

```bash
# Condition A — Baseline
node scripts/campaign.mjs --condition A --reps 10 --workers 4

# Condition B — Auto-waiting
node scripts/campaign.mjs --condition B --reps 10 --workers 4

# Condition C — Auto-waiting + isolation
node scripts/campaign.mjs --condition C --reps 10 --workers 4
```

### 5. Analyze Results

```bash
node scripts/analyze.mjs results
```

The analysis generates:

```text
results/
├── summary.json
├── summary.md
└── flakiness.csv
```

---

## Running in a Container

If Playwright's bundled browsers are unavailable, use the system Chromium installation.

```bash
CHROME_PATH=/usr/local/bin/chromium \
node scripts/campaign.mjs --condition C --reps 5
```

---

## Visual Evidence Generation

Capture application states using the configured latency envelope.

```bash
LATENCY_BASE=300 LATENCY_SPREAD=400 \
./scripts/with-sut.sh node scripts/capture.mjs
```

Generate annotated screenshots and charts:

```bash
python scripts/make_figures.py
```

The generated figures include:

- Flakiness rate with confidence intervals.
- Execution-level failure comparison.
- Per-test flakiness heatmap.
- Suite duration comparison.
- One-page experimental dashboard.
- Annotated screenshots of all eight application states.

Visual artifacts are stored under:

```text
results/figures/
```

---

## Cross-Browser Acceptance Campaign

The GitHub Actions workflow is configured for manual execution.

### Trigger

Navigate to:

**GitHub Repository → Actions → acceptance-campaign → Run workflow**

### Configuration

| Input | Initial Validation | Full Campaign |
|---|---:|---:|
| Repetitions | 3 | 50 |
| Browsers | Chromium, Firefox, WebKit | Chromium, Firefox, WebKit |
| Conditions | A, B, C | A, B, C |

### Workflow

```text
Manual Dispatch
      │
      ▼
Browser × Condition Matrix
      │
      ├── Chromium: A, B, C
      ├── Firefox: A, B, C
      └── WebKit: A, B, C
      │
      ▼
Evidence Artifact Upload
      │
      ▼
Aggregate Results
      │
      ▼
KPI Analysis
      │
      ▼
Campaign Summary
```

The matrix executes experimental conditions in parallel, uploads per-test evidence, and runs a dependent analysis job that merges artifacts and publishes the campaign summary.

---

## AWS Experimental Testbed

AWS is used as the experimental campaign infrastructure rather than as the application hosting environment.

### Architecture

| AWS Service | Role |
|---|---|
| Amazon ECR | Stores pinned application and campaign container images |
| Amazon ECS | Orchestrates campaign execution |
| AWS Fargate | Runs isolated campaign containers |
| Amazon S3 | Stores trace bundles and campaign evidence |
| Amazon CloudWatch | Collects telemetry and logs |
| AWS Fault Injection Service | Supports controlled fault experiments |
| Terraform | Provisions and manages infrastructure |

### Deployment Model

Each experimental condition runs as an isolated Fargate task with pinned CPU and memory resources.

Evidence and traces are stored in S3, telemetry is collected through CloudWatch, and fault-injection experiments support additional campaign scenarios.

### Deployment

```bash
cd infra/terraform

terraform init

terraform apply \
  -var="sut_image=<ecr-image>@sha256:<digest>" \
  -var="campaign_image=<ecr-image>@sha256:<digest>"
```

> **Important:** Infrastructure is defined but has not been applied to a live AWS account.

For architecture details, cost estimates, security considerations, and deployment order, see [`docs/aws-architecture.md`](docs/aws-architecture.md).

---

## Evidence and Reproducibility

Every experimental claim is mapped to a retained artifact.

| Evidence | Artifact |
|---|---|
| Campaign configuration | `results/manifest.jsonl` |
| Individual test executions | Per-test JSONL records |
| Flakiness analysis | `results/flakiness.csv` |
| Aggregated results | `results/summary.json` |
| Human-readable report | `results/summary.md` |
| Application states | `results/figures/` |
| Diagnostic traces | Per-execution trace bundles |
| Research claims | `docs/evidence-manifest.md` |
| Detailed campaign results | `docs/RESULTS.md` |

The evidence plane is designed to make campaign results auditable and failures diagnosable without relying exclusively on re-execution.

---

## Current Status

### Implemented and Measured

- [x] Instrumented application under test.
- [x] Baseline fixed-sleep harness.
- [x] Playwright auto-waiting candidate.
- [x] Authentication isolation.
- [x] Per-test data namespaces.
- [x] Three experimental conditions.
- [x] Campaign orchestration.
- [x] Repetition and state seeding.
- [x] Flakiness analysis.
- [x] Wilson confidence intervals.
- [x] Run-level failure metrics.
- [x] Execution-level failure metrics.
- [x] Suite duration analysis.
- [x] Per-test failure reporting.
- [x] Trace-based failure diagnosis.
- [x] Screenshot capture.
- [x] Figure generation.
- [x] AWS infrastructure definitions.
- [x] CI campaign workflow.

### Pending Full Validation

- [ ] Full three-engine experimental campaign.
- [ ] Cross-browser consistency analysis.
- [ ] Independent diagnosis scoring by two human raters.
- [ ] Recovery-rate measurement.
- [ ] Load-level error-rate measurement.
- [ ] Latency p95 measurement.
- [ ] Full-scale repetition campaign.
- [ ] Live AWS testbed deployment.
- [ ] Fault-injection campaign.

---

## Limitations

1. **Small sample size:** The initial campaign uses 8, 6, and 6 repetitions across the three conditions. Confidence intervals remain wide.
2. **Cross-browser validation:** Initial measurements were performed on Chromium only. Firefox and WebKit validation remains pending.
3. **Diagnosis evaluation:** The rubric is defined, and one failure has been scored. Independent evaluation by two human raters is not yet complete.
4. **Fault-injection KPIs:** Recovery rate, load-level error rate, and latency p95 require additional experiments.
5. **AWS deployment:** Terraform infrastructure is defined but not deployed to a live account.
6. **Baseline artifacts:** Eight of the 27 failures recorded under Condition A were navigation-interruption errors generated by the baseline policy itself. Excluding these leaves a 25.0% flaky-test rate, so the observed direction of improvement does not depend solely on this artifact.
7. **Hydration instrumentation:** `sut/public/app.js` accepts `?hydrateDelay=<ms>` to widen the paint-to-interactivity window for visual capture. It changes the duration of the window, not its behavior.

---

## Research Documentation

| Document | Description |
|---|---|
| [`docs/paper.pdf`](docs/paper.pdf) | Research paper covering architecture, protocol, preregistered KPIs, experimental results, and references |
| [`docs/paper.docx`](docs/paper.docx) | Editable version of the research paper |
| [`docs/RESULTS.md`](docs/RESULTS.md) | Full campaign results with per-test details |
| [`docs/aws-architecture.md`](docs/aws-architecture.md) | AWS architecture, cost model, security, and deployment |
| [`docs/evidence-manifest.md`](docs/evidence-manifest.md) | Evidence register mapping claims to supporting artifacts |

---

## Contribution

The differentiating contribution of this project is the integration of **state-based synchronization, authentication and data isolation, and evidence-driven diagnosis** into a controlled experimental framework.

Rather than treating flaky tests as isolated failures, the system:

1. Identifies synchronization-related failures.
2. Removes timing dependence through state-based waiting.
3. Eliminates cross-test interference through isolation.
4. Captures execution evidence for diagnosis.
5. Quantifies the effects of each improvement through controlled ablation.
6. Provides a reproducible acceptance campaign for cross-browser validation.

The B → C comparison specifically isolates the contribution of state isolation without changing the underlying candidate test framework.

---

## Future Work

- Complete the full-scale three-browser campaign.
- Expand the number of repetitions to improve statistical confidence.
- Evaluate additional network and application fault scenarios.
- Introduce load generation and latency profiling.
- Evaluate recovery and resilience metrics.
- Complete independent diagnostic scoring.
- Deploy the AWS testbed.
- Extend the framework to larger application suites and distributed environments.

---
