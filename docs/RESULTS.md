# Flakiness campaign summary

Generated 2026-11-26T02:20:41.601Z

Metric definitions: F = |{t : 0 < f(t) < n}| / |T|; run-level = proportion of suite executions with at least one failure. Intervals are Wilson 95%.

| Condition | Reps | Tests | Flaky tests | F (95% CI) | Run-level (95% CI) | Exec failure rate | Cross-browser consistency | Mean suite duration |
|---|---|---|---|---|---|---|---|---|
| A | 8 | 8 | 4 | 50.0% [21.5%, 78.5%] | 100.0% [67.6%, 100.0%] | 42.2% | n/a | 17.8 s |
| B | 6 | 8 | 1 | 12.5% [2.2%, 47.1%] | 16.7% [3.0%, 56.4%] | 2.1% | n/a | 62.0 s |
| C | 6 | 8 | 0 | 0.0% [0.0%, 32.4%] | 0.0% [0.0%, 39.0%] | 0.0% | n/a | 59.5 s |

## Per-test detail

### Condition A

| Test | Executions | Failures | Failure rate | Flaky | First sample error |
|---|---|---|---|---|---|
| T1 sign-in reaches the dashboard | 8 | 0 | 0.0% | no |  |
| T3 displayed total equals the sum of amounts | 8 | 5 | 62.5% | yes | page.goto: Navigation to "http://127.0.0.1:4173/" is interrupted by another navigation to  |
| T2 order list paints with the seeded rows | 8 | 2 | 25.0% | yes | page.goto: Navigation to "http://127.0.0.1:4173/" is interrupted by another navigation to  |
| T4 adding an order updates the list and the total | 8 | 3 | 37.5% | yes | total 57 != NaN |
| T7 order list still shows the seeded rows after an unrelated action | 8 | 8 | 100.0% | no | expected 3 rows after unrelated action, found 6 |
| T5 settings persist across a reload | 8 | 8 | 100.0% | no | theme after reload was "light" |
| T8 creating several orders keeps the total consistent | 8 | 0 | 0.0% | no |  |
| T6 open-only filter shows only open orders | 8 | 1 | 12.5% | yes | filter leaked status "paid" |

### Condition B

| Test | Executions | Failures | Failure rate | Flaky | First sample error |
|---|---|---|---|---|---|
| T2 order list paints with the seeded rows | 6 | 0 | 0.0% | no |  |
| T1 sign-in reaches the dashboard | 6 | 0 | 0.0% | no |  |
| T3 displayed total equals the sum of amounts | 6 | 0 | 0.0% | no |  |
| T4 adding an order updates the list and the total | 6 | 0 | 0.0% | no |  |
| T6 open-only filter shows only open orders | 6 | 0 | 0.0% | no |  |
| T7 order list still shows the seeded rows after an unrelated action | 6 | 0 | 0.0% | no |  |
| T5 settings persist across a reload | 6 | 1 | 16.7% | yes | Error: [31mTimed out 8000ms waiting for [39m[2mexpect([22m[31mlocator[39m[2m).[22m |
| T8 creating several orders keeps the total consistent | 6 | 0 | 0.0% | no |  |

### Condition C

| Test | Executions | Failures | Failure rate | Flaky | First sample error |
|---|---|---|---|---|---|
| T3 displayed total equals the sum of amounts | 6 | 0 | 0.0% | no |  |
| T2 order list paints with the seeded rows | 6 | 0 | 0.0% | no |  |
| T1 sign-in reaches the dashboard | 6 | 0 | 0.0% | no |  |
| T4 adding an order updates the list and the total | 6 | 0 | 0.0% | no |  |
| T6 open-only filter shows only open orders | 6 | 0 | 0.0% | no |  |
| T5 settings persist across a reload | 6 | 0 | 0.0% | no |  |
| T7 order list still shows the seeded rows after an unrelated action | 6 | 0 | 0.0% | no |  |
| T8 creating several orders keeps the total consistent | 6 | 0 | 0.0% | no |  |

## Contrasts

- A -> B (wait policy: fixed sleeps to auto-waiting): F 50.0% -> 12.5% (75.0% relative reduction); mean suite duration +249.1%
- B -> C (contribution: per-worker state isolation): F 12.5% -> 0.0% (100.0% relative reduction); mean suite duration -4.0%
- A -> C (complete system): F 50.0% -> 0.0% (100.0% relative reduction); mean suite duration +235.0%
