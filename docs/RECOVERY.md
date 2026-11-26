# Recovery campaign (KPI-4)

Generated 2026-11-26T03:18:41.834Z

**Recovery rate: 100.0% (9/9 injections).**

An injection counts as recovered only when the service answers again, observed state equals intended state, and no write is duplicated or lost.

| Metric | Value |
|---|---|
| Time to first successful read after fault removal | min 62 ms, median 90 ms, max 99 ms |

## By fault type

| Fault | Injections | Recovered | Duplicates | Lost |
|---|---|---|---|---|
| error-rate — half of the data requests return 503 | 3 | 3 | 0 | 0 |
| latency-spike — every request takes 2.5-3.0 s | 3 | 3 | 0 | 0 |
| dropped-responses — the write is applied, the response is destroyed | 3 | 3 | 0 | 0 |

## Per injection

| # | Fault | Acked | Ambiguous | Created | Dup | Lost | First read | Recovered |
|---|---|---|---|---|---|---|---|---|
| 1 | error-rate | 18 | 0 | 18 | 0 | 0 | 84 ms | yes |
| 2 | latency-spike | 2 | 0 | 2 | 0 | 0 | 96 ms | yes |
| 3 | dropped-responses | 20 | 17 | 37 | 0 | 0 | 97 ms | yes |
| 4 | error-rate | 19 | 0 | 19 | 0 | 0 | 64 ms | yes |
| 5 | latency-spike | 2 | 0 | 2 | 0 | 0 | 90 ms | yes |
| 6 | dropped-responses | 16 | 24 | 40 | 0 | 0 | 99 ms | yes |
| 7 | error-rate | 21 | 0 | 21 | 0 | 0 | 62 ms | yes |
| 8 | latency-spike | 2 | 0 | 2 | 0 | 0 | 91 ms | yes |
| 9 | dropped-responses | 16 | 23 | 39 | 0 | 0 | 65 ms | yes |
