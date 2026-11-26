# Diagnosis rubric and rater sheet (KPI-3)

Frozen before measurement. Five criteria, 20 points each, total 100. Two independent raters
score each bundle; report the mean and the agreement, not a single number.

| Criterion | Weight | Anchor 0 | Anchor 50 | Anchor 80 | Anchor 100 |
|---|---|---|---|---|---|
| The failing step is identifiable | 20 | no action log; the failure position is unknown | the failing test is known but not the step | the failing action and its locator are visible in the action log | the failing action, its locator, its duration and the moment of failure are all visible |
| The application state at the moment of failure is visible | 20 | no snapshot or screenshot | a screenshot of the end state only | a DOM snapshot at the failing action | DOM snapshots before, during and after the failing action |
| The causal sequence leading to the failure is recoverable | 20 | no network or console evidence | either network or console, not both | network and console, time-aligned to the actions | network and console time-aligned, with the request that produces the asserted state identifiable |
| The evidence supports deciding whether the defect is in the product or in the test | 20 | the failure is indistinguishable from a product error | a suspicion, not supported by the artefacts | the artefacts distinguish a product defect from a test defect | the artefacts name which side is at fault and what the correct behaviour would have been |
| The failure can be explained without re-executing it | 20 | re-execution is required | partially: some questions need a rerun | the cause can be stated from the artefacts alone | the cause and the fix can be stated from the artefacts alone |

## Score sheet

| Bundle | Rater A | Rater B | Mean | Agreement | Cause named |
|---|---|---|---|---|---|
| (fill per bundle) | | | | | |
