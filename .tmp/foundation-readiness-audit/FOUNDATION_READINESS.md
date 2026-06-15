# Foundation Readiness — Per-Ingredient Status

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Context:** Re-validation after Phase 4A (Mozzarella poison delete), 4B (`created_at` repair), 4C (multi-`un` denominator fix)  
**Scripts run:** `validate-historical-pricing.mts`, `validate-repair-scope.mts`, live DB queries for Açúcar / Chocolate / Nata

---

## Summary

| Metric | Result |
|---|---|
| Audit sample | 9 ingredients |
| Foundation-ready | **8 / 9** |
| Blockers | **1** — Nata culinária |
| Originally failed (Phase 1) | 6 — all now **VALID** |

---

## Per-Ingredient Status Table

| Ingredient | ID | Phase 1 | Post 4A/4B/4C | History rows | `current_price` ✓ | `op_matches` ✓ | Contamination |
|---|---|---|---|---|---|---|---|
| Pepino conserva | `635a1189-36ea-4ff2-9012-8172ab1ab81d` | VALID | **VALID** | 2 | ✅ | ✅ all | None |
| Arroz agulha | `07a55cf5-b98d-4aae-b330-b4944882e4d3` | VALID | **VALID** | 2 | ✅ | ✅ all | None |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | SUSPICIOUS | **VALID** | 2 | ✅ 9.99 | ✅ 9.49/9.99 | None (4C fixed divide) |
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | INCORRECT | **VALID** | 2 | ✅ 13.10 | ✅ 6.29/13.10 | None (Apr 6.29, Δ +108%) |
| Mozzarella fior di latte | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | INCORRECT | **VALID** | 1 | ✅ 13.69 | ✅ | None (4A deleted 2 rows) |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` | SUSPICIOUS | **VALID** | 2 | ✅ 10.49 | ✅ 10.19/10.49 | None (4C fixed divide) |
| Açúcar branco | `c46db69a-e4ae-4be8-abb8-d7708de12f3d` | — | **VALID** | 2 | ✅ 0.999 | ✅ | None |
| Chocolate culinária | `43cba6b0-880e-4760-ab78-8d9a9c1b6f86` | — | **VALID** | 2 | ✅ 2.999 | ✅ | None (May 29.99 correct) |
| **Nata culinária** | `3d1af48c-be3c-494a-9e0f-be267fc9388b` | — | **SUSPICIOUS** | 2 | ❌ 3.048 vs hist 3.148 | ✅ math OK | **Active** — row `14330aad` |

---

## Validation Script Results (6 core ingredients)

All six pass `validate-historical-pricing.mts`:

| Check | Result |
|---|---|
| `current_price_from_latest_history` | **true** for all six |
| `op_matches_invoice` | **true** for every confirmed purchase |
| Atum April `new_price` | **6.29** (was 3.145) |
| Atum May `delta_percent` | **+108.3%** (was +316.5%) |
| Anchoas catalog op | **9.99** (was 4.995) |
| Gema catalog op | **10.49** (was 1.748) |

### `validate-repair-scope.mts`

| Check | Result |
|---|---|
| `global_corrupted_count` | **0** (4B success) |
| Mozzarella `row_count` | **1**, `delete_present: false` |
| `duplicate_groups_count` | **0** |
| Multi-`un` `suspect_double_divide` | **0/5** (4C success) |
| `suggested_match_history_count` | **1** — Nata `14330aad` ⚠️ |

---

## Nata Blocker Detail

May invoice `3b4cb21f`:

| Field | Value |
|---|---|
| Match status | **`suggested`** (semantic), not confirmed |
| History row | **`14330aad`** exists → `new_price=3.148` (18.89÷6) |
| Catalog | April confirmed price: **18.29÷6 = 3.048** |
| Divergence | Catalog op **3.048** vs latest history op **3.148** |

Phase 4B noted this divergence (“catalog unchanged by design”) but did not delete the orphan history row. Same contamination pattern as pre-4A Mozzarella — history written from an unconfirmed suggested match.

---

## What Changed vs Phase 1

| Was broken | Fixed by | Evidence |
|---|---|---|
| Mozzarella duplicates + poison row | 4A | 1 history row, catalog 13.69 |
| 7× `created_at` year corruption | 4B | `global_corrupted_count: 0` |
| Atum +316% spike, multi-`un` divide | 4C | Apr 6.29, Δ +108%, 0 suspect divides |
| Anchoas/Gema half-price catalog | 4C | Catalog refreshed to per-tin/tub prices |
