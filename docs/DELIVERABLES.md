# Deliverables register (D1–D7)

The charter names seven deliverables. This register maps each one to the artefact that
satisfies it, so a gate review can be answered by opening a file rather than by
searching the repository.

| ID | Charter wording | Artefact | Status |
|---|---|---|---|
| **D1** | Approved problem charter, requirements, system boundary, architecture, source-to-claim map | `docs/paper.pdf` §1 (problem), §3 (failure model), §4 (objectives), §5 (architecture); `docs/evidence-manifest.md` | complete, except the signed stakeholder problem-validation record, which is a human artefact |
| **D2** | Reproducible automatic waiting with fixtures, oracle, tests, baseline results, resource profile | `harness/fixed-sleep/` (baseline B0), `harness/candidate/` (candidate B1), `results/A.jsonl`, `results/summary.md` | complete |
| **D3** | Independently testable state isolation with design rationale, comparative evidence, trade-offs, limitations | `harness/candidate/fixtures.mjs` (the `ISOLATION` switch), `results/summary.md` contrasts, `docs/paper.pdf` §5.4 and §6.7 | complete |
| **D4** | Complete prototype with configuration, interfaces, telemetry, degraded operation, recovery | `sut/`, `scripts/`, `results/NEGATIVE-TESTS.md`, `results/RECOVERY.md`, `results/LOAD.md` | complete |
| **D5** | Acceptance harness covering AC-1 to AC-4, every KPI and every negative test | `scripts/campaign.mjs`, `scripts/analyze.mjs`, `scripts/faults.mjs`, `scripts/recovery.mjs`, `scripts/load.mjs`, `scripts/diagnose.mjs` | complete; the three-engine run needs the CI environment |
| **D6** | Versioned repository, evidence manifest, installation and operating guide, interface documentation, reproducibility instructions | this repository, `docs/evidence-manifest.md`, `README.md` | complete |
| **D7** | Final report, paper, poster, portfolio case study, demonstration video, video logs, individual contribution and viva evidence | `docs/paper.pdf` (16+ pages, 12 tables, 5 figures) | paper complete; poster, video, video logs and viva pack are student artefacts |

## Where each KPI is answered

| KPI | Measure | Evidence | Value |
|---|---|---|---|
| KPI-1 | Flakiness rate across repeated runs | `results/summary.md` | 50.0% → 12.5% → 0.0%; C over 14 repetitions, 112 test executions, no failure |
| KPI-2 | Cross-browser consistency pass rate | needs three engines; `results/summary.json` records the field as `null` | open |
| KPI-3 | Diagnosis without re-run (0–100) | `results/DIAGNOSIS-RUBRIC.md`, `scripts/diagnose.mjs` | 76 pre-fix, 100 on bundles produced after the fix; needs two human raters |
| KPI-4 | Recovery rate under fault injection | `results/RECOVERY.md` | 100% (9/9 injections, three fault types) |
| KPI-5 | Service error rate at declared load | `results/LOAD.md` | 0.00% of 1522 requests at 16 concurrent clients |
| KPI-6 | Request latency p95 | `results/LOAD.md` | 319.8 ms (p50 210.9, p99 332.4) |

## Acceptance conditions

| ID | Condition | Evidence |
|---|---|---|
| AC-1 | Representative operation | campaign over 8 tests × 3 conditions |
| AC-2 | Boundary and failure operation | `results/NEGATIVE-TESTS.md` (NT-1 to NT-5), `results/RECOVERY.md` |
| AC-3 | Independent acceptance evidence | versioned workload and envelope in `results/manifest.jsonl`; independent review is a human step |
| AC-4 | Frozen resource envelope | envelope object recorded per repetition in `results/manifest.jsonl` |

## Not in this repository, by design

- The signed problem-validation record from a named stakeholder.
- Two independent human raters for the diagnosis rubric.
- The demonstration video, video logs, poster and individual contribution statements.
- The three-engine campaign run: the workflow exists, the App on this account lacks
  `Actions: write`, so it must be dispatched from the Actions tab.

## D7 artefacts produced

| Artefact | File | Notes |
|---|---|---|
| Research paper | `docs/paper.pdf` | 18 pages, 12 tables, 5 figures |
| Poster | `poster/poster.pdf` | A3, rendered from `poster/poster.html` |
| Portfolio case study | `case-study/case-study.pdf` | A4 one-pager, rendered from HTML |
| Demonstration runbook | `docs/DEMO-RUNBOOK.md` | ten-minute sequence with timings and expected questions |
| Viva question bank | `docs/VIVA-QUESTION-BANK.md` | fifteen likely questions with answers, plus the numbers to have ready |
| Problem-validation record | `validation-record/record.pdf` | printable two-page record for a named stakeholder's signature (D1) |
| Demonstration video, video logs, viva pack | — | student artefacts, not automatable |
