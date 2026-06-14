# Current Price Impact — Reassign A → B

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Q3: Is old ingredient current_price recalculated?

**No** (for ingredient A).

`revertIngredientCurrentPriceFromHistory` (`ingredient-price-history.ts:616-647`) is only called from `subtractivePricingCleanupForUnmatch` (`match-lifecycle-unmatch-pricing.ts:66`).

`persistOperationalIngredientCostFromInvoiceLine` updates only the **target** `ingredientId` passed in (`ingredient-auto-persist.ts:109-130`); reassign passes **B** (`invoices.tsx:1946-1948`).

---

## Cost Event Scope

| Event | Unmatch (A→No Match) | Reassign (A→B) |
|-------|----------------------|----------------|
| `dispatchOperationalIngredientCostChanged` for A | ✅ `invoices.tsx:2187-2191` | ❌ |
| `dispatchOperationalIngredientCostChanged` for B | ❌ | ✅ `invoices.tsx:2132-2135` |
| `revertIngredientCurrentPriceFromHistory` (A) | ✅ | ❌ |
| `persistOperationalIngredientCostFromInvoiceLine` (B) | ❌ | ✅ |

---

## Pepino Evidence

After correction from Pepino conserva to another ingredient, `635a1189` `current_price` was **not reverted** (`.tmp/match-correction-reversal-audit/`). Reassign path behavior is unchanged from pre-Phase-5 correction flow for ingredient A.
