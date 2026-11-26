# Demonstration runbook (10 minutes)

The demo has one job: show that the failure is real, that the fix is real, and that the
numbers were measured rather than asserted. Everything below runs from the repository.

## Before you start

```bash
npm ci && npx playwright install chromium firefox webkit   # once, on the demo machine
node scripts/campaign.mjs --condition C --reps 2 --workers 4   # warm-up run, so nothing stalls live
```

Have two terminals open: one in the repository, one for commands you will type on screen.
Have `docs/paper.pdf` open at Section 6.7 and the poster open on a second screen.

## The sequence

| Time | Show | Say |
|---|---|---|
| 0:00 | The poster headline numbers | "End-to-end tests fail intermittently until nobody trusts them. I measured how much of that a test-execution system can remove." |
| 0:45 | `results/figures/fig04-hydration-window.png` | "This is the defect in one picture. The list is painted, the button is enabled, and the listener is not attached yet. A click here is accepted and does nothing." |
| 1:45 | `results/figures/fig08-fixed-sleep-assert-window.png` | "This is what the baseline sees at assertion time: zero rows. Nothing is wrong with the application." |
| 2:30 | `node scripts/campaign.mjs --condition A --reps 2 --workers 4` | "Fixed sleeps, shared account. Watch the failures appear." Point at the failing test names, not the count. |
| 4:00 | `node scripts/campaign.mjs --condition C --reps 2 --workers 4` | "Same workload, same envelope, state-based waiting and per-worker isolation. Zero failures." |
| 5:30 | `node scripts/analyze.mjs results` | "This is the measurement, not a claim: flakiness rate with Wilson intervals, run-level rate, and the A→B→C contrasts." |
| 6:30 | `node scripts/diagnose.mjs results/artifacts/<...>/trace-*.zip` | "Every failing execution leaves a bundle. The rubric scores it on five criteria. It refused to diagnose a stripped bundle, which is the behaviour I wanted." |
| 7:45 | `node scripts/faults.mjs` | "Five mandatory negative tests. NT-5 is the interesting one: the write is applied and the response destroyed, and the retry produces no duplicate." |
| 9:00 | `docs/paper.pdf` Table 8 | "Six KPIs, four acceptance conditions, five negative tests. Three are open and I say why: two engines are missing here, and two human raters cannot be me." |
| 9:40 | The repository | "One command reproduces every number on this poster." |

## Questions you should expect

**"Why is the interval on C so wide?"** Because six repetitions cannot resolve a rate near zero.
The interval is the honest statement of what six runs support; hiding it would be the error.

**"Isn't B→C just one failure?"** Yes — one failure in 48 executions. I report it as a signal,
not a measurement, and the CI campaign with fifty repetitions exists to narrow it.

**"Why not just use Playwright and be done?"** Playwright supplies the mechanism, not the
guarantee. The hydration-window defect was in my own test, written with auto-waiting available;
the engine can only wait for the state the author names.

**"What did AWS add?"** A representative environment: three engines, pinned task definitions for
a frozen envelope, S3 for bundles, FIS for platform-level faults. It is not where the app runs.

**"What is not done?"** Cross-browser consistency, the official diagnosis score (needs two
raters), and the platform-level fault campaign. All three are named in the paper's limitations,
not omitted from it.
