# History Impact — Reassign A → B

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Q2: Is old ingredient history deleted?

**No.**

`deleteIngredientPriceHistoryForInvoiceIngredient` is defined at `ingredient-price-history.ts:584-613` and is only invoked from `subtractivePricingCleanupForUnmatch` (`match-lifecycle-unmatch-pricing.ts:52-56`), which is only called from `unmatchInvoiceLineMatch` (`match-lifecycle-unmatch.ts:51-55`).

Grep across `src/routes/invoices.tsx` for `deleteIngredientPriceHistory`, `revertIngredientCurrentPrice`, `reconcileIngredientPriceHistoryChain`, `subtractivePricing` → **no matches**.

---

## Q6: Can history row remain attached to A after reassignment?

**Yes.**

History is keyed by `(invoice_id, ingredient_id)` (`ingredient-price-history.ts:224-225`, `596-598`). Reassign changes the match to B but does not delete `(invoice_id, A)`.

**Historical evidence:** `.tmp/match-correction-reversal-audit/data-not-reverted.json` — row `a689bd91` on ingredient `635a1189` (Pepino conserva) remains after correction.

---

## Q7: Can duplicate pricing influence occur?

**Yes.**

After A→B reassign on the same invoice:

- Row `(invoice_id, A)` **persists**
- Row `(invoice_id, B)` is **INSERTed or UPDATEd** (`ingredient-auto-persist.ts:140-153`)
- A's `current_price` is **not reverted**; B's `current_price` is **set immediately** from the same invoice line

Same `invoice_id` can attribute pricing to **both** A and B. `.tmp/match-correction-reversal-audit/verdict.json` documents `dual_attribution` under `orphaned_records_after_correction_A`.

---

## Reassign vs Unmatch (History)

| Action | Delete `(invoice_id, A)` history | Write `(invoice_id, B)` history |
|--------|----------------------------------|--------------------------------|
| Unmatch A | ✅ `deleteIngredientPriceHistoryForInvoiceIngredient` | ❌ |
| Reassign A→B | ❌ | ✅ `appendIngredientPriceHistoryFromInvoiceLine` |
