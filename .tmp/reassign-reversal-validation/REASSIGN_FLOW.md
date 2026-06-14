# Reassign Flow — A → B

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Path

`openIngredientCorrection` → `handleSelectCorrectionIngredient` → `selectIngredientForItem` → `persistIngredientCorrectionForItem` → `dualWriteMatchLifecycleAfterIngredientPersist` → `reassignMatch`

---

## Writes on Reassign A → B

| # | Write | Function | Location |
|---|-------|----------|----------|
| 1 | Reject pair (localStorage) | `rejectIngredientMatchPair` | `invoices.tsx:3242-3249` |
| 2 | `ingredient_aliases` UPSERT → B | `persistManualIngredientCorrection` → `upsertConfirmedAlias` | `invoices.tsx:1913-1920`, `ingredient-correction-memory.ts:189-284` |
| 3 | `ingredients.current_price` + `purchase_quantity` for **B** | `persistOperationalIngredientCostFromInvoiceLine` | `invoices.tsx:1946-1959`, `ingredient-auto-persist.ts:124-130` |
| 4 | `ingredient_price_history` INSERT or UPDATE for `(invoice_id, B)` | `appendIngredientPriceHistoryFromInvoiceLine` | `ingredient-auto-persist.ts:140-153`, `ingredient-price-history.ts:458-580` |
| 5 | `invoice_item_matches` update: `status=confirmed`, `ingredient_id=B`, `previous_ingredient_id=A`, `corrected_at=now` | `reassignMatch` → `correctMatch` | `invoices.tsx:211-218`, `match-lifecycle-service.ts:165-177`, `132-146` |
| 6 | localStorage alias map | `window.localStorage.setItem` | `invoices.tsx:2030-2033` |
| 7 | OI cost-changed event for **B** | `dispatchOperationalIngredientCostChanged` | `invoices.tsx:2132-2135` |

---

## Not Written on Reassign

- `invoice_items` — unchanged
- Ingredient **A**: no history delete, no `current_price` revert, no alias delete
- `reconcileIngredientPriceHistoryChain` for **A**
- `dispatchOperationalIngredientCostChanged` for **A**

---

## Reject Pair

Written when `previousIngredientId !== ingredientId` (`invoices.tsx:3242-3249`).

Persists to localStorage via `rememberRejectedIngredientMatch` + `persistRejectedIngredientMatchesToStorage` (`ingredient-correction-memory.ts:386-409`). Does not delete alias rows or DB history.

---

## Reference Scenarios

**Pepino conserva → Pepino fresco:** Same code path as any A→B reassign with `wasConfirmed=true` → `reassignMatch`.

**Mozzarella A → Mozzarella B:** Identical behavior — no ingredient-family-specific cleanup.

---

## Cross-Reference

Phase 5 `FINAL_VERDICT.md` line 64 explicitly defers **T7 correction subtractive (A→B history delete on reassign)**.
