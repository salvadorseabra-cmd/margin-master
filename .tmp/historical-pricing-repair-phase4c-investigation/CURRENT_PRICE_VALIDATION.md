# Current Price Validation — Atum (Phase 4C Pre-Repair)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15 (post-4B `created_at` repair)  
**Ingredient:** `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` (Atum em óleo)

---

## Catalog

| Field | Value | Operational € |
|---|---|---|
| `current_price` | 13.10 | **13.10** |
| `purchase_quantity` | 1 | — |
| `unit` / `base_unit` | `g` | — |

---

## Validation checks

| Check | Result |
|---|---|
| `ingredients.current_price` | **13.10** ✅ |
| Latest confirmed purchase (May `79956d1b`) | 1 × €13.10 = €13.10 ✅ |
| `fetchLatestHistoryNewPrice` (post-4B) | **13.10** ✅ (was 3.145 pre-4B) |
| `current_price_from_latest_history` | **true** ✅ |
| Denominator effect on catalog | **None** — May line has `purchase_qty=1`; bug only halved April history |
| `revertIngredientCurrentPriceFromHistory` | Would set **13.10** ✅ (post-4B) |

---

## Confirmed purchase trace

| Invoice | Date | Line | Qty | Unit | Unit price | Expected op | History row | Catalog match? |
|---|---|---|---|---|---|---|---|---|
| `3b4cb21f` | 2026-05-19 | Atum Oleo Bolsa Nau Catrineta 1 Kg | 1 | un | 13.10 | 13.10 | `781ab1ac` | ✅ |
| `c2f52357` | 2026-04-17 | Atum Óleo Bolsa Nau Catrineta 1 Kg | 2 | un | 6.29 | **6.29** (stored 3.145 ❌) | `61c51696` | N/A (not latest) |

---

## Before vs after (4B ordering fix)

| Query path | Pre-4B | Post-4B |
|---|---|---|
| Catalog | 13.10 ✅ | 13.10 ✅ |
| History latest (`fetchLatestHistoryNewPrice`) | 3.145 ❌ | 13.10 ✅ |
| April row `new_price` | 3.145 ❌ | 3.145 ❌ (unchanged — denominator not repaired) |
| May Δ% | N/A (wrong prior) | +316% ❌ (true ~+108%) |

---

## Verdict

**Atum `current_price` validation: PASS**

- Catalog €13.10 is economically correct and derived from the correct May purchase.
- Denominator bug affects **April history row** and **May delta semantics**, not today's catalog price.
- Phase 4C must fix history values/deltas; catalog re-persist for Atum is **not required**.
