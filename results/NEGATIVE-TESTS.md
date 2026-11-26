# Negative-test and recovery campaign

Generated 2026-11-26T03:03:08.901Z

**5 passed, 0 held, 0 failed.**

## NT-1 — Intermittent failure injected at the application boundary

| Field | Value |
|---|---|
| Verdict | **pass** |
| Trigger | failRate=0.4 on the SUT data routes for 40 requests |
| Expected safe behaviour | Failures are reported, every failure is attributable to the injected fault, no request is silently passed, and the system returns to clean once the fault is removed |
| baselineErrorRate | 0.000 |
| injectedErrorRate | 0.450 |
| errorsAttributedToFault | 18/18 |
| errorRateAfterRemoval | 0.000 |
| recoveryMs | 2973 |
| Residual-risk decision | low: failures are attributable, but a real product error during an injection window would be indistinguishable from the injected fault |
| Duration | 9474 ms |

## NT-2 — Shared authentication state across parallel flows

| Field | Value |
|---|---|
| Verdict | **pass** |
| Trigger | 4 concurrent writers to one account over 12 rounds, repeated with one account per writer |
| Expected safe behaviour | With a shared account the collision is observable; with per-worker isolation no writer observes another writer’s value |
| sharedAccountRoundsWithForeignValue | 4/12 |
| isolatedRoundsWithForeignValue | 0/48 |
| isolationRemovesCoupling | true |
| Residual-risk decision | low: coupling is reproducible and removed by isolation; a suite that still shares an account is not protected |
| Duration | 4646 ms |

## NT-3 — A failure stripped of trace artefacts

| Field | Value |
|---|---|
| Verdict | **pass** |
| Trigger | diagnosis attempted against a failure whose trace bundle is absent |
| Expected safe behaviour | The system reports insufficient evidence and declines to name a cause, instead of producing a confident but unsupported diagnosis |
| scoreWithEvidence | 100 |
| verdictWithEvidence | diagnosed |
| scoreWithoutEvidence | 0 |
| verdictWithoutEvidence | insufficient_evidence |
| namedCauseWithoutEvidence | null |
| Residual-risk decision | low: the failure mode is a refusal to diagnose, which is safe |
| Duration | 25 ms |

## NT-4 — Telemetry insufficient to identify the failing component

| Field | Value |
|---|---|
| Verdict | **pass** |
| Trigger | the network stream is removed from an otherwise complete trace bundle |
| Expected safe behaviour | The gap is reported as a distinct outcome class naming the missing signal, not as a low-confidence diagnosis |
| score | 70 |
| verdict | telemetry_gap |
| missingSignals | ["causal_sequence"] |
| Residual-risk decision | low: the gap is named, so the operator knows which signal to add |
| Duration | 33 ms |

## NT-5 — Partial failure leaves desired and observed state inconsistent

| Field | Value |
|---|---|
| Verdict | **pass** |
| Trigger | dropResponseRate=0.5: the write is applied server-side and the response is destroyed, so the client cannot tell whether it succeeded |
| Expected safe behaviour | No silent loss and no duplicate work; the client retries with an idempotency key and reconciliation from the last durable checkpoint proves the observed state matches the intended state |
| writesIntended | 20 |
| acknowledged | 20 |
| ambiguousResponses | 9 |
| ordersBefore | 3 |
| ordersAfter | 23 |
| created | 20 |
| duplicates | 0 |
| lost | 0 |
| checksumAfter | 00e1a42ca80c |
| reconcileMs | 3 |
| Residual-risk decision | low: exactly-once effect is preserved by the idempotency key, but only for clients that send one |
| Duration | 1554 ms |

