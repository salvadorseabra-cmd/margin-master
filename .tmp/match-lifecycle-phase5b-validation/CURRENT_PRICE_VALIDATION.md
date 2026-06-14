# Phase 5B — Current Price Validation

**Generated:** 2026-06-14

---

## Q3: Is old ingredient current_price recalculated?

**Yes** (with subtractive flags ON).

`revertIngredientCurrentPriceFromHistory(previousIngredientId)` runs in shared cleanup before B forward write.

## Cost Events

| Event | Reassign A→B (Phase 5B) |
|-------|-------------------------|
| `dispatchOperationalIngredientCostChanged` for A | ✅ trigger `invoice_reassign` |
| `dispatchOperationalIngredientCostChanged` for B | ✅ trigger `invoice_manual_match` |
| `revertIngredientCurrentPriceFromHistory` (A) | ✅ |
| `persistOperationalIngredientCostFromInvoiceLine` (B) | ✅ (unchanged, after cleanup) |

## Pepino

After conserva → fresco reassign, conserva `current_price` reverts from surviving chain (jar history) via reconcile + revert — same mechanism as unmatch.

## Verdict (Q3)

**FULLY_REVERSIBLE**
