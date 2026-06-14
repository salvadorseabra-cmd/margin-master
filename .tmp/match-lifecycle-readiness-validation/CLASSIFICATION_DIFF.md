# Classification Diff — Virtual displayState vs Persisted status (51 VL lines)

**Generated:** 2026-06-14 · **Virtual baseline:** query-summary.json (2026-06-13 live matcher)

---

## Taxonomy Summary

| Bucket | Virtual (displayState) | Expected Persisted (post-backfill) | Aligned? |
|--------|----------------------:|-----------------------------------:|----------|
| unmatched | 40 | 40 | ✅ 40/40 |
| suggested | 4 | 5 | ⚠️ +1 drift |
| confirmed | 7 | 6 | ⚠️ −1 drift |
| **Total** | **51** | **51** | **50/51 aligned** |

---

## Drift Matrix

| Virtual → Persisted | Count | Lines |
|--------------------|------:|-------|
| confirmed → confirmed | 6 | Alias-backed (see ALIAS_AUDIT.md) |
| **confirmed → suggested** | **1** | **Pepino (Bidfood) — `kind: exact`** |
| suggested → suggested | 4 | Atum×2, Chocolate May, Bocconcino Mozzarella |
| unmatched → unmatched | 40 | All other lines |

---

## The Single Drift Line

| Field | Value |
|-------|-------|
| Product | Pepino (Bidfood, 3.36 kg, €1.77/kg) |
| Latest `invoice_item_id` | `514feb41-6cd4-44f1-abc8-344f0c0dfc23` |
| Virtual | `displayState: confirmed`, `kind: exact` |
| Persisted (expected) | `status: suggested`, `ingredient_id: 635a1189` |
| Reason | `resolvePersistedMatchStatusFromMatcher` only confirms `confirmed-alias` / `confirmed-override` |

---

## Note on Prior Phase 4 Drift Doc

`DRIFT_ANALYSIS.md` states persisted `suggested ≈ 15`. Correct count from matcher rules is **5** (4 semantic + 1 Pepino). The "~15" figure double-counts extract-sync lines.

---

## Actual DB State

**No persisted rows exist** — classification diff is simulated from code + virtual baseline only.

See `classification-matrix.json` for structured data.
