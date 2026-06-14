# Phase 5B — Subtractive Cleanup Report

**Generated:** 2026-06-14

---

## Goal

Make A→B equivalent to `(unmatch A) + (assign B)` for subtractive cleanup on ingredient A.

## Implementation

Extracted shared core from unmatch pricing:

```typescript
subtractivePricingCleanupForPreviousIngredient(client, { invoiceId, ingredientId, wasConfirmed })
```

Reassign wrapper:

```typescript
subtractivePricingCleanupForReassign(client, { invoiceId, previousIngredientId, wasConfirmed })
```

Gated by `isMatchLifecycleReassignSubtractiveEnabled()` AND `isMatchLifecycleSubtractivePricingEnabled()`.

## Operations on A (when flags ON + confirmed reassign)

1. `deleteIngredientPriceHistoryForInvoiceIngredient(invoiceId, A)`
2. `reconcileIngredientPriceHistoryChain(A)`
3. `revertIngredientCurrentPriceFromHistory(A)`
4. `clearIngredientMatchedInvoiceProductsCache(A)` (when delete or revert mutates)
5. `dispatchOperationalIngredientCostChanged(A)` (invoices.tsx)

## Suggested correction (wasConfirmed=false)

Same as unmatch T4: cleanup only when legacy `(invoice_id, A)` history row exists.

## Rollback

| Action | Effect |
|--------|--------|
| `VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE=false` | Reassign reverts to pre-5B (no A cleanup) |
| `VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING=false` | Disables all subtractive cleanup (unmatch + reassign) |

## Duplication Avoided

Unmatch continues to call `subtractivePricingCleanupForUnmatch` (subtractive pricing flag only). Reassign calls shared core via `subtractivePricingCleanupForReassign` (both flags).
