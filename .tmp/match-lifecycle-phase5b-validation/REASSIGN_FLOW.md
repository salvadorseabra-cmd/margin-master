# Phase 5B — Reassign Flow (A → B)

**Generated:** 2026-06-14 · **Status:** IMPLEMENTED

---

## Path

`openIngredientCorrection` → `handleSelectCorrectionIngredient` → `selectIngredientForItem` → `persistIngredientCorrectionForItem` → `dualWriteMatchLifecycleAfterIngredientPersist` → `reassignMatch`

---

## Write Order (Phase 5B)

| # | Write | Function | Location |
|---|-------|----------|----------|
| 1 | Reject pair (localStorage) | `rejectIngredientMatchPair` | `invoices.tsx:3242-3249` |
| 2 | **Subtractive cleanup on A** | `subtractivePricingCleanupForReassign` | `invoices.tsx:selectIngredientForItem` (before persist) |
| 2a | Delete `(invoice_id, A)` history | `deleteIngredientPriceHistoryForInvoiceIngredient` | via shared `subtractivePricingCleanupForPreviousIngredient` |
| 2b | Reconcile chain for A | `reconcileIngredientPriceHistoryChain` | shared module |
| 2c | Revert A `current_price` | `revertIngredientCurrentPriceFromHistory` | shared module |
| 2d | Clear OI cache for A | `clearIngredientMatchedInvoiceProductsCache` | shared module |
| 2e | Cost-changed event for A | `dispatchOperationalIngredientCostChanged` | `invoices.tsx` trigger `invoice_reassign` |
| 3 | `ingredient_aliases` UPSERT → B | `persistManualIngredientCorrection` | `persistIngredientCorrectionForItem` |
| 4 | `ingredients.current_price` + history for **B** | `persistOperationalIngredientCostFromInvoiceLine` | `persistIngredientCorrectionForItem` |
| 5 | `invoice_item_matches` update → B | `reassignMatch` → `correctMatch` | `dualWriteMatchLifecycleAfterIngredientPersist` |
| 6 | Cost-changed event for **B** | `dispatchOperationalIngredientCostChanged` | trigger `invoice_manual_match` |

---

## Insertion Point

**Before** `persistIngredientCorrectionForItem` (forward writes to B), **after** reject pair in `handleSelectCorrectionIngredient`.

Condition: `lifecycle.previousIngredientId && lifecycle.previousIngredientId !== ingredientId`.

---

## Feature Flags

| Flag | Default | Scope |
|------|---------|-------|
| `VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE` | ON | Reassign A cleanup kill switch |
| `VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING` | ON | Master subtractive delete/reconcile/revert APIs (unmatch + reassign) |

Both must be ON for reassign subtractive cleanup. Disable reassign only → pre-5B partial behavior.

---

## Modules

| Module | Role |
|--------|------|
| `match-lifecycle-unmatch-pricing.ts` | Shared `subtractivePricingCleanupForPreviousIngredient` |
| `match-lifecycle-reassign-pricing.ts` | Reassign flag gate → shared cleanup |
| `match-lifecycle-unmatch.ts` | Unmatch orchestrator (unchanged path) |
