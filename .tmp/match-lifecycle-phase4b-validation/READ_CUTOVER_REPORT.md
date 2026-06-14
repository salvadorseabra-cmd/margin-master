# Phase 4B Read Cutover Report

**Generated:** 2026-06-14 · **Mode:** read cutover ON (simulated)

---

## Coverage

| Metric | Value |
| --- | --- |
| `invoice_items` | 51 |
| `invoice_item_matches` | 51 |
| Coverage | 51/51 |

---

## Cutover Metrics

| Metric | Count |
| --- | --- |
| Persisted hits | 51 |
| Fallback hits | 0 |
| Missing persisted rows | 0 |
| Unexpected mismatches | 0 |
| Intentional status drift (Pepino-class) | 1 |

---

## Dual-Read Baseline (unchanged)

| Metric | Count |
| --- | --- |
| Aligned | 51 |
| Drifted | 0 |
| Missing | 0 |
| Orphaned | 0 |

---

## Flags

| Flag | Value |
| --- | --- |
| `VITE_MATCH_LIFECYCLE_SHADOW_SEED` | true |
| `VITE_MATCH_LIFECYCLE_DUAL_WRITE` | true |
| `VITE_MATCH_LIFECYCLE_READ_CUTOVER` | true |
