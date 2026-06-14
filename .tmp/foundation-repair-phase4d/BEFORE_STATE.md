# Before State — Foundation Repair Phase 4D (Nata)

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Ingredient:** Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b`

---

## Scope validation (pre-repair)

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Delete row exists | `14330aad-cce1-4569-aa2f-4976dd1ac336` | Present on Nata | ✅ |
| Keep row exists | `2767b722-cce1-4569-aa2f-4976dd1ac336` | Present (April confirmed) | ✅ |
| Ingredient | Nata culinária | `3d1af48c-be3c-494a-9e0f-be267fc9388b` | ✅ |
| Match status (May) | suggested/semantic | suggested on item `1826cbe9` | ✅ |
| `suggested_match_history_count` (VL) | 1 | 1 | ✅ |
| Only suggested row on VL | Nata `14330aad` only | Confirmed via `validate-repair-scope.mts` | ✅ |

**Scope OK — proceeding with repair.**

---

## Catalog

| Field | Value |
|---|---|
| `current_price` | 18.29 |
| `purchase_quantity` | 6 |
| Catalog operational €/un | **3.048** |

---

## History rows (2)

| ID | Invoice | Date | Match basis | New op | Action |
|---|---|---|---|---|---|
| `2767b722-cce1-4569-aa2f-4976dd1ac336` | `c2f52357` April | 2026-04-17 | **confirmed** | 3.048 | **KEEP** |
| `14330aad-cce1-4569-aa2f-4976dd1ac336` | `3b4cb21f` May | 2026-05-19 | **suggested/semantic** | 3.148 | **DELETE** |

---

## Contamination metrics

| Metric | Value |
|---|---|
| History row count | 2 |
| Latest history operational | **3.148** (orphan suggested row) |
| Catalog operational | **3.048** |
| `current_price_from_latest_history` | **false** |
| `suggested_match_history_count` (global VL) | **1** |
| Foundation-ready ingredients (9-sample audit) | **8/9** |

---

## Root cause (unchanged from investigation)

`backfillIngredientPriceHistoryFromInvoices` wrote history for suggested match without confirmed status. Backfill is history-only — catalog stayed at April confirmed price while latest history surfaced May unconfirmed price.

Same contamination class as pre-4A Mozzarella poison row.
