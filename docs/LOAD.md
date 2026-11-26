# Load measurement (KPI-5, KPI-6)

Declared load: 16 concurrent clients for 20 s against `GET /api/orders`, after a 3 s warm-up that is excluded from the measurement.

| Metric | Value |
|---|---|
| Requests measured | 1522 |
| Throughput | 75.2 req/s |
| **Service error rate (KPI-5)** | **0.00%** |
| Latency p50 | 210.9 ms |
| **Latency p95 (KPI-6)** | **319.8 ms** |
| Latency p99 | 332.4 ms |
| Latency max | 414.1 ms |

Status distribution: `{"200":1522}`

The KPI targets are expressed relative to a reference measurement in the same envelope.
This run establishes the absolute values; the reference comparison belongs to the
representative environment where both configurations can be run at the same declared load.
