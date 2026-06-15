# After State — Foundation Repair Phase 4D (Nata)

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Ingredient:** Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b`

---

## Post-repair metrics

| Metric | Before | After | Pass |
|---|---|---|---|
| History row count | 2 | **1** | ✅ |
| Latest history operational | 3.148 (orphan) | **3.048** | ✅ |
| Catalog operational | 3.048 | **3.048** | ✅ |
| `current_price_from_latest_history` | false | **true** | ✅ |
| `suggested_match_history_count` (VL) | 1 | **0** | ✅ |
| Foundation-ready (9-sample audit) | 8/9 | **9/9** | ✅ |

---

## Catalog (unchanged)

| Field | Value |
|---|---|
| `current_price` | 18.29 |
| `purchase_quantity` | 6 |
| Catalog operational €/un | **3.048** |

---

## History rows (1 remaining)

| ID | Invoice | Date | Match basis | New op |
|---|---|---|---|---|
| `2767b722-0985-45a8-9c80-9e9dae611142` | `c2f52357` April | 2026-04-17 | **confirmed** | 3.048 |

**Deleted:** `14330aad-cce1-4569-aa2f-4976dd1ac336` (May suggested orphan)

---

## Validation results

| Check | Result |
|---|---|
| Row `14330aad` removed | ✅ |
| `suggested_match_history_count` = 0 | ✅ |
| Nata catalog op 3.048 = latest history 3.048 | ✅ |
| `current_price_from_latest_history` = true | ✅ |
| `validate-repair-scope.mts` duplicate_groups = 0 | ✅ |
| `validate-historical-pricing.mts` (6 core) all aligned | ✅ |
| Other ingredients untouched | ✅ |

---

## May invoice note (unchanged)

May Aviludo match on item `1826cbe9` remains **suggested** — no history row, no catalog impact. User may later confirm May price (18.89 / op 3.148) as a separate decision.
