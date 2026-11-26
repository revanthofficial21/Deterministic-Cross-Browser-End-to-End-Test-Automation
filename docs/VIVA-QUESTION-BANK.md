# Viva question bank

Fifteen questions a panel is likely to ask, with answers grounded in the numbers in this
repository. Each answer is short enough to say out loud in thirty seconds. Where a question
has a trap, the trap is named.

---

## 1. "What problem does this actually solve?"

End-to-end browser tests fail intermittently, so teams stop trusting them and eventually
delete them. I measured how much of that unreliability belongs to the test-execution system
rather than to the application: 50.0% of test cases were flaky under a fixed-sleep,
shared-account suite, and 0.0% under state-based waiting with per-worker isolation — zero
failures in 112 test executions.

## 2. "Isn't this just using Playwright?"

No. Playwright supplies a mechanism, not a guarantee, and the strongest evidence is in my own
work: the one failure that survived auto-waiting was in a test I wrote, which waited on
"the button is enabled" when the correct condition was "the page is hydrated". The engine can
only wait for the state the author names. What I built is the measurement apparatus that tells
you whether the mechanism is working, and the isolation layer that removes a failure class the
mechanism cannot touch.

## 3. "Why three conditions instead of before and after?"

Because two changes were in play. A→B changes the wait policy; B→C changes state isolation.
With a single before/after you cannot attribute the improvement to either. Condition B exists
so the contribution has an unconfounded comparison on identical code.

> **The trap:** saying "A is Selenium and B is Playwright" as if that were a clean comparison.
> It is not, and the paper says so in the threats section: A is a fixed-sleep harness on the
> same driver, deliberately, so the A→B contrast isolates the wait policy rather than the
> framework.

## 4. "Your C interval goes up to 32%. How is that a result?"

That is the honest statement of what eight test cases and fourteen repetitions support. The
point estimate is zero and the run-level rate is zero over 112 executions, so the effect is
real; the interval says I cannot pin its size precisely at this scale. Reporting a point
estimate without the interval would be the error.

## 5. "Why is the suite slower now? Isn't that a regression?"

Yes — 17.8 s to about 59 s, a 3.4× increase, and it is the cost of determinism. A fixed sleep
is fast because it guesses; state-based waiting observes. I report it as the paired resource
KPI rather than hiding it, and the honest framing is that I traded wall-clock time for a suite
whose failures mean something.

## 6. "How do you know the failures are real and not your harness?"

Three ways. The application publishes its own state (`data-state`, `data-hydrated`), so the
test asserts on the application's claim rather than on a timer. The independent oracle is
written separately from the suite under test. And the negative tests inject faults deliberately
and verify that the system reports them — NT-1 shows 11 of 11 injected failures attributed to
the fault, with zero false passes.

## 7. "What is the hardest bug you found?"

A defect in my own diagnosis instrument. With a bundle containing no evidence at all, the
scorer returned "telemetry gap" instead of "insufficient evidence", because it compared the
number of missing signals against the number of rubric criteria. NT-3 caught it. That matters
because an instrument that cannot distinguish "no evidence" from "partial evidence" would have
inflated exactly the score it exists to produce.

## 8. "And the second one?"

The rubric then found a defect in my evidence path. Five failing bundles scored 76/100, below
threshold, and the cause was not the scorer: four bundles contained only the runner's own trace,
because Playwright flushes the browser trace when the context closes and loses it on an early
failure. Recording explicitly in a test-scoped fixture fixed it — every bundle produced
afterwards scores 100/100. The remaining limitation is coverage: 1 of 7 failing executions
produced a bundle, and I report that separately from the score.

## 9. "What does the isolation layer actually isolate?"

Four things: the browser session (one context per test), the authentication identity (one
account per parallel worker, materialised once and reused within the worker), server-side data
(a namespace derived from the test id), and harness-global resources (per-test output paths,
ephemeral ports, no module-level mutable state). NT-2 shows the coupling is real: 7 of 12 rounds
read a foreign value on a shared account, and 0 of 48 with one account per writer.

## 10. "Why not just serialise the tests and avoid the problem?"

Because parallelism is the reason the suite runs at all, and serialising hides the coupling
rather than removing it. Order dependence also survives serialisation — the literature
distinguishes victim and brittle tests precisely because rerunning one test in isolation cannot
expose the problem.

## 11. "What is the AWS part for? Couldn't you do this on a laptop?"

The laptop is the fallback the charter permits. AWS is for the representative environment: three
engines, pinned task definitions so the resource envelope is frozen (AC-4), S3 for trace
bundles that must outlive the run, and Fault Injection Service for platform-level faults the
application cannot anticipate. I could not run two of the three engines in this container, which
is exactly the gap the cloud testbed closes.

## 12. "What would you do differently with another semester?"

Three things, in order. Run the campaign at n = 50 on three engines, because that is what turns
a signal into a measurement. Move fault injection from the application to the platform, so the
recovery rate is measured against faults I did not design. And raise bundle coverage, because a
perfect score on 14% of failures is not a diagnosis capability.

## 13. "Which of your claims is weakest?"

Cross-browser consistency is unmeasured — I have a workflow that runs it and a container that
cannot. Second weakest is the contribution's effect size: one observed failure in 48 executions
at the time of the main campaign, which I reported as a signal rather than a measurement. Both
are named in the paper's limitations rather than left for the panel to find.

## 14. "How do I know you didn't tune the experiment to get 0%?"

The protocol was pre-registered: the envelope, the six KPIs, the four acceptance conditions and
the five negative tests were fixed before the contribution was tuned, and the paper's threats
section lists the artefacts that could bias each condition. It also records that eight of 27
failures in condition A are navigation-interruption errors caused by the baseline policy —
recomputing without them leaves 25.0% flaky, so the direction does not depend on them.

## 15. "What is the one-sentence version?"

A browser test suite's reliability is a property of the test-execution system — how it waits,
how it isolates state, and what it records — and measuring those three separately turns "our
tests are flaky" into numbers you can act on: 50.0% to 12.5% to 0.0%, with the residue
diagnosable from a trace instead of a rerun.

---

## Numbers to have ready

| Fact | Value |
|---|---|
| Flakiness rate, A / B / C | 50.0% / 12.5% / 0.0% (Wilson 95%: 21.5–78.5, 2.2–47.1, 0.0–32.4) |
| Repetitions | A 8, B 6, C 14 |
| Executions with no failure in C | 112 |
| Execution-level failure rate, A / B / C | 42.2% / 2.1% / 0.0% |
| Suite duration, A / B / C | 17.8 s / 62.0 s / 58.4 s |
| Negative tests | 5 of 5 pass |
| Recovery under fault injection | 100% (9 of 9), first read 62–99 ms after removal |
| Duplicates / lost writes under partial failure | 0 / 0 across 64 ambiguous responses |
| Service error rate at load | 0.00% of 1522 requests, 16 concurrent clients |
| Latency p95 at load | 319.8 ms (p50 210.9, p99 332.4) |
| Diagnosis score | 76/100 before the capture fix, 100/100 on bundles produced after |
| Bundle coverage | 1 of 7 failing executions |
