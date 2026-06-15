# Nata Culinária — Purchase & History Trace

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Ingredient:** Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b`  
**Mode:** Read-only — live Supabase REST query

---

## Catalog baseline

| Field | Value | Operational €/un |
|---|---|---|
| `current_price` | 18.29 | **3.048** (÷6) |
| `purchase_quantity` | 6 | 6×1L per cx |
| `purchase_unit` | cx | — |
| `base_unit` | un | — |

---

## Every Nata purchase

| # | Invoice | Supplier | Date | Item ID | Line | Qty | Unit | Total | Pack € | Op € | History ID | Match status | Catalog impact |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `c2f52357-0f80-491a-ba14-c97ff4837472` | AVILUDO | 2026-04-17 | `c871ece9` | Nata Reny Picot 22% 6x1L | 5 | cx | 91.45 | 18.29 | **3.048** | `2767b722-…` | **confirmed** (`confirmed-override`) | Set catalog → 18.29/6 ✅ |
| 2 | `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` | Aviludo | 2026-05-19 | `1826cbe9` | Nata Culinaria 22% Reny Picot 6x1 Lt | 5 | cx | 94.45 | 18.89 | **3.148** | `14330aad-…` ⚠️ | **suggested** (`semantic`) | **No catalog update** — orphan history only |

---

## History rows (2 total)

| ID | Invoice | Date | Match basis | Previous op | New op | Delta | `created_at` |
|---|---|---|---|---|---|---|---|
| `2767b722-cce1-4569-aa2f-4976dd1ac336` | `c2f52357` April | 2026-04-17 | **Confirmed** | — | 3.048 | — | 2026-04-17 |
| `14330aad-cce1-4569-aa2f-4976dd1ac336` ⚠️ | `3b4cb21f` May | 2026-05-19 | **Suggested/semantic** | 3.048 | 3.148 | +3.28% | 2026-05-19 (4B-repaired from 2023) |

---

## Math check

Both rows have correct operational math:

- April: 18.29 ÷ 6 = **3.048** €/un
- May: 18.89 ÷ 6 = **3.148** €/un

Delta on May row: +€0.10/un (+3.28%) — reflects a real price increase on the May invoice (+€0.60/cx, +3.3%).

---

## Current price impact

| Source | Operational €/un | Drives catalog? | Drives latest-history queries? |
|---|---|---|---|
| Catalog (`current_price` ÷ 6) | **3.048** | ✅ | — |
| Latest history (`14330aad`) | **3.148** | ❌ | ✅ (blocker) |

The May purchase did not update catalog because backfill is history-only and the match was never confirmed. Validators flag `current_price_from_latest_history: false` because latest history (3.148) ≠ catalog (3.048).

---

## Confirmed aliases (context)

Aliases seeded ~2026-06-07–09 for Reny/Remy Picot variants (AVILUDO / Avijudo). April line matched via alias → confirmed. May line matched semantically but alias mismatch ("Reny" vs "Remy", "Aviludo" vs "Avijudo") kept it at **suggested**.
