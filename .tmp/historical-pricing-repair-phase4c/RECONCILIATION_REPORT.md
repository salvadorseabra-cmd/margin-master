# Reconciliation Report — Phase 4C

**Script:** `scripts/repair-multi-un-history.mts --execute`  
**Date:** 2026-06-15

## Steps executed

1. **Backup** — 6 history rows + catalog snapshot → `multi-un-phase4c-pre-update-2026-06-14T23-44-45.json`
2. **Recompute** — `operationalCostFieldsFromInvoiceLine(norm)` with corrected pipeline (not hardcoded)
3. **Update** — 5 rows with wrong `new_price` (Atum May skipped — already 13.10)
4. **Reconcile** — `reconcileIngredientPriceHistoryChain` × 3 ingredients
5. **Catalog refresh** — Anchoas + Gema: `purchase_quantity` → 1, `current_price` unchanged (pack price)
6. **Atum revert** — Not needed (catalog already matched latest history at 13.10)

## Reconcile results

| Ingredient | Linked rows | Rows updated (chain) | Orphans deleted |
|---|---|---|---|
| Atum em óleo | 2 | 1 (May delta chain) | 0 |
| Anchoas | 2 | 2 | 0 |
| Gema líquida | 2 | 2 | 0 |

## Post-reconcile chain (Atum)

```
Apr 61c51696: prev=null  → new=6.29
May 781ab1ac: prev=6.29  → new=13.10  Δ%=+108.27%
```

## Post-reconcile latest history

| Ingredient | Latest op |
|---|---|
| Atum | 13.10 |
| Anchoas | 9.99 |
| Gema líquida | 10.49 |

All match catalog operational after refresh.
