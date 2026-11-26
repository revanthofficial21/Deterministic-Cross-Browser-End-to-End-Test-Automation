# Where AWS belongs in this project

The project is classified as **Cloud and Edge Systems**, and the charter's facility
requirement is an *"isolated container or cluster testbed with workload generation,
telemetry and fault injection; no production dependency is required"*, with a fallback
path that *"may reduce scale but must retain O2, O3, O4 and O5"*.

That sentence decides the answer: AWS is not where the product runs, it is where the
**test-execution system** runs. The system under test is deliberately small; the thing
that needs elastic, isolated, disposable compute is the *campaign* — many repetitions,
many parallel workers, three browser engines, fault injection and trace retention.

Using AWS for the wrong reason (hosting a demo web app on EC2) adds cost and no evidence.
Using it for the right reasons buys four things the local fallback cannot:

| What the acceptance contract needs | Why local fails | AWS answer |
|---|---|---|
| Repetitions at scale (n = 50 per browser per condition) | 2 vCPU laptop, hours of wall-clock, contention between workers distorts the measurement | Fargate tasks per shard, run in parallel, identical task definitions |
| A frozen, reproducible resource envelope (AC-4) | Laptop state drifts between runs | Pinned task CPU/memory, pinned image digests, one task definition per condition |
| Fault injection that is not simulated (NT-1, NT-5) | Container tricks only; no real network/latency fault | FIS actions against ECS tasks |
| Trace retention and diagnosis without re-running (O4) | Disk fills, artefacts lost with the sandbox | S3 with versioning + lifecycle, CloudWatch Logs |

## Mapping onto the three planes

### Control plane
| Component | AWS service | Role |
|---|---|---|
| Campaign orchestrator | **ECS Fargate task** (one per condition × shard) | Runs `scripts/campaign.mjs --condition X --reps N --start K` |
| Account and data provisioning | **SUT task + `/_reset` control surface** | Each shard seeds identical state before every repetition |
| Secrets (test account passwords, session keys) | **Secrets Manager** | Never in the image, never in the repo |
| Image build | **ECR** | Digest-pinned; the digest goes into the run manifest |

### Execution plane
| Component | AWS service | Role |
|---|---|---|
| SUT | **ECS Fargate service** (1 task, private subnet) | The asynchronous application under test |
| Browser workers | **ECS Fargate tasks** (4–8 per shard) | Chromium / Firefox / WebKit via Playwright images |
| Cross-browser coverage | One task definition per engine, or one task with three projects | WebKit and Firefox are the engines the local fallback cannot run |
| Fault injection | **FIS** (`aws:ecs:task-network-latency`, `aws:ecs:task-cpu-stress`, `aws:ecs:task-stop`) | NT-1 intermittent failure, NT-5 partial failure |

### Evidence plane
| Component | AWS service | Role |
|---|---|---|
| Trace bundles | **S3** (versioned, SSE-KMS, lifecycle to Glacier after 90 d) | The O4 artefact store; one prefix per condition/run |
| Per-test records and run manifests | **S3** + **Athena** (optional) | Query flakiness without re-running anything |
| Runtime telemetry | **CloudWatch Logs + metrics** | Wait durations, worker counts, task failures |
| Diagnosis review | **S3 presigned URLs** | Two independent raters open the same bundle, no cluster access |

## What it costs

Order-of-magnitude, for one full campaign (three conditions × 50 repetitions × 3 engines),
assuming a 10-minute suite and 4 Fargate workers per shard, in `ap-south-1`:

- ~150 task-hours of 2 vCPU / 4 GB Fargate → a few tens of dollars.
- S3 for traces at ~400 KB per failing execution → single-digit GB → under a dollar.
- CloudWatch Logs is the sleeper cost: set retention to 14 days, not "never expire".

Check the current AWS pricing calculator before you commit — prices move, and your
region and account tier are yours, not mine. If credits are unavailable, the charter's
fallback is legitimate: run the campaign locally at reduced n (this repository does
exactly that) and state the reduction in the report.

## What AWS does **not** do for you

- It does not make the tests deterministic. Every KPI still depends on the harness.
- It does not satisfy the independent-reviewer requirement (AC-3): raters are people.
- It does not replace the problem-validation record or the stakeholder sign-off.

## Deployment order

1. `infra/terraform` → ECR repo, S3 bucket, log group, IAM roles, cluster.
2. Build and push the image (`docker build -t dx-e2e .` then push to ECR).
3. Register two task definitions: `sut` and `campaign` (see `infra/terraform/main.tf`).
4. Run the SUT service, then one campaign task per condition.
5. Copy `results/` to S3 and open the summary; run `scripts/analyze.mjs` inside the
   campaign task so the summary is produced where the evidence is.
6. Run the FIS experiment for NT-1 and NT-5, with the same workload, and retain the
   experiment ID in the evidence manifest.

## Security notes

- GitHub Actions → AWS via **OIDC role assumption**, never long-lived keys.
- SUT and campaign tasks in private subnets; no public IPs; egress through a NAT
  gateway only if a dependency genuinely needs it (this suite does not).
- The S3 bucket blocks public access; trace bundles can contain session cookies, so
  they are treated as sensitive: SSE-KMS, no public ACLs, and `playwright/.auth` is
  git-ignored and never uploaded.
- Test-account credentials live in Secrets Manager and are injected as env vars.
