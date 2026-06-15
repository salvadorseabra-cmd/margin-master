# Final Verdict — Historical Pricing Repair Phase 4C (Pre-Repair Investigation)

**Date:** 2026-06-15  
**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · live `validate-repair-scope.mts` run 2026-06-14T23:26Z  
**Mode:** Read-only — no fixes executed, no commits

---

## Verdict: **REQUIRES FIX** (code + data reconciliation)

---

## Executive summary

| Metric | Value |
|---|---|
| **Root cause** | `resolveCountablePurchaseQuantityForCost` returns `rowQty` when `unit=un` & qty>1, dividing `unit_price` again even when it is already per bag/tin |
| **Atum April row** | `61c51696` — stored `3.145` (should be **6.29**) |
| **Atum May row** | `781ab1ac` — `new_price=13.10` correct, `delta_percent=+316.5%` wrong (true **+108%**) |
| **Blast radius (VL)** | **5 confirmed invoice lines → 6 history rows → 3 ingredients** (Atum, Anchoas, Gema líquida) |
| **Atum `current_price`** | **€13.10 — correct** (May qty=1 purchase; denominator bug did not halve catalog) |
| **Post-4B ordering** | Latest history = 13.10 ✅; values/deltas still wrong |
| **Recommended fix** | Code fix first → `reconcileIngredientPriceHistoryChain` on 3 ingredients (+ catalog refresh for Anchoas/Gema) |

---

## Seven audit questions

| # | Question | Answer |
|---|---|---|
| 1 | What is the root cause? | Double-divide: `purchase_quantity = rowQty` when `unit_price` is already per item |
| 2 | Which rows are wrong? | 6 history rows (IDs below); Atum April primary |
| 3 | Is `current_price` wrong for Atum? | **No** — €13.10 correct |
| 4 | Is latest history selection correct post-4B? | **Yes** — May 13.10 sorts last |
| 5 | Is the 316% spike real? | **No** — artifact of 3.145 prior; true move **+108%** |
| 6 | Atum-only or generic? | **Generic** — 3 ingredients, 5 invoice lines on VL |
| 7 | What is smallest safe repair? | Code fix + `reconcileIngredientPriceHistoryChain` × 3 + catalog refresh for Anchoas/Gema |

---

## Classification matrix

| Item | Historical artifact | Active contamination | Requires fix | Safe to ignore |
|---|---|---|---|---|
| Atum April `61c51696` (3.145) | ❌ | ✅ history/deltas | ✅ | ❌ |
| Atum May `781ab1ac` (316% Δ) | partial | ✅ delta semantics | ✅ | ❌ |
| Atum `current_price` 13.10 | — | — | — | ✅ |
| Anchoas/Gema history (4 rows) | ❌ | ✅ | ✅ | ❌ |
| Anchoas/Gema catalog | ❌ | ✅ costing | ✅ | ❌ |
| `created_at` corruption | — | — | — | ✅ (4B done) |
| Mozzarella poison | — | — | — | ✅ (4A done) |

---

## Exact row IDs for repair scope

```
61c51696-acd8-4a58-878f-a588c1878af0  Atum Apr
781ab1ac-39d2-4462-9106-635e5603c466  Atum May (rechain)
952119dc-8645-4a5f-a3ff-191ae1a57ea8  Anchoas Apr
908de185-e61a-4f41-af4c-3b70f69bd08f  Anchoas May
e967f673-1dc5-4390-90e6-464b66ec2a4b  Gema Apr
e143080d-511b-4c37-9018-11949343aedc  Gema May
```

---

## Recommended repair path (Phase 4C execution)

```
1. Code: resolveCountablePurchaseQuantityForCost (per-unit-price detection + optional kg routing)
2. reconcileIngredientPriceHistoryChain('0f30ccb3-bb47-40bb-83cc-ae2a4018066d')
3. reconcileIngredientPriceHistoryChain('c811f67f-df4d-4194-ba8b-7a15d4af38bd')
4. reconcileIngredientPriceHistoryChain('32dbf47d-347c-45f3-bd9f-c6e90640e767')
5. Re-persist Anchoas + Gema catalog from latest confirmed invoice lines
6. validate-historical-pricing.mts — expect Atum Apr new=6.29, May Δ%≈108%, multi_un count=0
```

---

## Related deliverables

| File | Contents |
|---|---|
| `ATUM_PIPELINE_TRACE.md` | Full invoice → history pipeline for both Atum purchases |
| `DENOMINATOR_TRACE.md` | 6.29÷2=3.145 code path with citations |
| `MULTI_UNIT_AUDIT.md` | All 5 VL multi-`un` lines — VALID/INCORRECT |
| `BLAST_RADIUS.md` | 3 ingredients, catalog/opportunity contamination |
| `REPAIR_OPTIONS.md` | Options A–D with scope/risk (not implemented) |
| `CURRENT_PRICE_VALIDATION.md` | Atum catalog €13.10 — PASS |
