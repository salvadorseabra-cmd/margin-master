# Chain Reconciliation — Reassign A → B

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Q4: Is `reconcileIngredientPriceHistoryChain` called for A?

**No.**

`reconcileIngredientPriceHistoryChain` (`ingredient-price-history-reconcile.ts:124-217`) is called from:

- `subtractivePricingCleanupForUnmatch` (unmatch only) — `match-lifecycle-unmatch-pricing.ts:61`
- `appendIngredientPriceHistoryFromInvoiceLine` on **refreshExisting UPDATE** — `ingredient-price-history.ts:550-553`
- `reconcileAfterInvoiceDelete` — `ingredient-price-history-reconcile.ts:232`

None of these run for ingredient **A** on A→B reassign.

---

## Q5: Is `reconcileIngredientPriceHistoryChain` called for B?

**Conditionally — not on typical first-time INSERT.**

In `appendIngredientPriceHistoryFromInvoiceLine`:

- `refreshExisting = existingRow != null` (`ingredient-price-history.ts:473-474`)
- Reconcile runs **only** inside the `if (refreshExisting)` branch (`ingredient-price-history.ts:531-555`)
- Fresh INSERT path (`ingredient-price-history.ts:563-580`) does **not** call reconcile

For Pepino conserva→Pepino fresco (or Mozzarella A→B) where B has no prior `(invoice_id, B)` row, reconcile for B is **not** invoked.

---

## Unmatch Reconcile Path (Contrast)

Unmatch calls:

1. `deleteIngredientPriceHistoryForInvoiceIngredient(invoiceId, previousIngredientId)`
2. `reconcileIngredientPriceHistoryChain(previousIngredientId)`

Reassign calls neither for ingredient A.

---

## `isMatchLifecycleSubtractivePricingEnabled`

Comment references "unmatch/correct-away" (`match-lifecycle-flags.ts:83-84`), but subtractive cleanup is wired **only** to unmatch — not reassign.
