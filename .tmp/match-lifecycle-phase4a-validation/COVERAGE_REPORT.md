# Phase 4A Coverage Report

**Generated:** 2026-06-14 · **Mode:** dual-read validation (no cutover)

---

## Counts

| Metric | Value |
| --- | --- |
| `invoice_items` | 51 |
| `invoice_item_matches` | 51 |
| Coverage | 51/51 |
| Missing persisted | 0 |
| Orphan persisted | 0 |

---

## Dual-Read Metrics

| Metric | Count |
| --- | --- |
| Aligned | 51 |
| Drifted | 0 |
| Missing | 0 |
| Orphaned | 0 |
| Intentional status drift (Pepino-class) | 1 |

---

## Flags (`.env.local`)

| Flag | Value |
| --- | --- |
| `VITE_MATCH_LIFECYCLE_SHADOW_SEED` | true |
| `VITE_MATCH_LIFECYCLE_DUAL_WRITE` | true |
| `VITE_MATCH_LIFECYCLE_DUAL_READ_LOG` | (unset) |

---

## Outcome

**Coverage:** PASS — 51/51 persisted rows.
