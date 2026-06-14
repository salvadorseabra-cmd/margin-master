# Phase 5 — Pricing Reconciliation

**Generated:** 2026-06-14 · Design: `LIFECYCLE_TRANSITIONS.md` T4/T5

## Feature Flag

| Flag | Default | Effect |
|------|---------|--------|
| `VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING` | **ON** | Delete + reconcile + revert on unmatch |

Disable with `false` / `0` / `off` for lifecycle tombstone-only rollback.

## T4 — Suggested → Unmatched

| Layer | Action |
|-------|--------|
| `ingredient_price_history` | None (expected) |
| Legacy poison row | Deleted if `(invoice_id, ingredient_id)` row exists |

## T5 — Confirmed → Unmatched

| Step | Function |
|------|----------|
| 1. Delete row | `deleteIngredientPriceHistoryForInvoiceIngredient(invoice_id, ingredient_id)` |
| 2. Rechain | `reconcileIngredientPriceHistoryChain(ingredient_id)` |
| 3. Revert catalog | `revertIngredientCurrentPriceFromHistory(ingredient_id)` |
| 4. Cache | `clearIngredientMatchedInvoiceProductsCache(ingredient_id)` |
| 5. Event | `dispatchOperationalIngredientCostChanged({ trigger: "invoice_unmatch" })` |

### Revert semantics

`revertIngredientCurrentPriceFromHistory`:

1. `fetchLatestHistoryNewPrice` → latest linked operational `new_price`
2. `current_price = operational × purchaseQuantityDenom(purchase_quantity)`
3. If no surviving history → `current_price = null`

## New APIs (`ingredient-price-history.ts`)

- `deleteIngredientPriceHistoryForInvoiceIngredient`
- `revertIngredientCurrentPriceFromHistory`

## Tests

| Test file | Assertions |
|-----------|------------|
| `match-lifecycle-unmatch-pricing.test.ts` | Flag gate; confirmed vs suggested paths |
| `match-lifecycle-unmatch.test.ts` | Pepino poison row `a689bd91` deleted; jar row survives |

## Out of Scope (Phase 6)

- Batch remediation of all historical poison
- T7 correction subtractive (A→B) — separate follow-up
