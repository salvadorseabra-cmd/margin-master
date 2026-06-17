# Code Path Confirmation

**Same path for all products:**

```
invoice line
  → operationalCostFieldsFromInvoiceLine
  → resolveCountablePurchaseQuantityForCost ← root cause locus
  → persistOperationalIngredientCostFromInvoiceLine
  → appendIngredientPriceHistoryFromInvoiceLine
  → operationalUnitPriceForPriceHistory(pack, purchase_quantity)
  → new_price stored
```

**Fix exists:** `isUnitPricePerPricedUnit` in `invoice-purchase-price-semantics.ts` — returns `purchase_qty=1` when unit_price is per-item.

**Live DB:** Still contaminated — Phase 4C repair regressed by 2026-06-16 (Atum Apr back to €3.145).

**Files:** `src/lib/invoice-purchase-price-semantics.ts`, `src/lib/ingredient-price-history.ts`
