# Evidence manifest

Every claim in the paper maps to a retained artefact. This register is the mapping.

| Claim | Artefact | Location | Version control |
|---|---|---|---|
| A → B flakiness reduction | Per-test records for conditions A and B | `results/A.jsonl`, `results/B.jsonl` | committed |
| B → C contribution effect | Per-test records for condition C | `results/C.jsonl` | committed |
| Envelope was frozen (AC-4) | One manifest line per repetition with the envelope object | `results/manifest.jsonl` | committed |
| Rates and intervals | Computed summary | `results/summary.json`, `summary.md`, `flakiness.csv` | committed |
| Trace-based diagnosis (O4) | Playwright trace bundles for failing executions | `results/artifacts/<condition>/run-<n>/` | uploaded as CI artefact |
| Reference reproduction (O2) | Baseline harness + independent oracle assertions | `harness/fixed-sleep/`, `harness/candidate/specs/` | git |
| Contribution isolation (O3) | Isolation layer with the ablation switch | `harness/candidate/fixtures.mjs` | git |
| Workload definition | SUT + seeded fixture shape | `sut/server.js` | git |
| Fault injection (NT-1, NT-5) | FIS experiment template | `infra/terraform/main.tf`, `infra/fis/` | git |
| Cloud testbed (facility requirement) | Terraform stack | `infra/terraform/` | git |
| Reproducibility | Pinned versions, one-command campaign, clean-environment build | `package.json`, `README.md`, CI workflow | git |

## Not covered by this repository

- Problem-validation record signed by a named stakeholder (charter requirement, human).
- Independent human review of the diagnosis rubric (two raters, human).
- Demonstration video and individual contribution/viva evidence (human).
