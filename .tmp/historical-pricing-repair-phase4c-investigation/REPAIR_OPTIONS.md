# Repair Options — Phase 4C (DO NOT IMPLEMENT)

**Date:** 2026-06-15  
**Mode:** Read-only investigation — options documented only, no fixes executed

---

## Option A — Smallest safe fix (recommended)

### Steps

1. **Code:** Fix `resolveCountablePurchaseQuantityForCost` — when `unit_price` is per priced unit (`total ≈ qty × unit_price`), use denominator **1** (or weight-from-name for `1 Kg` → `purchase_quantity=1000`, base `g`).
2. **Data:** Run `reconcileIngredientPriceHistoryChain` for:
   - `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` (Atum)
   - `c811f67f-df4d-4194-ba8b-7a15d4af38bd` (Anchoas)
   - `32dbf47d-347c-45f3-bd9f-c6e90640e767` (Gema líquida)
3. **Catalog:** Re-persist or manual update **Anchoas** and **Gema** only (Atum catalog already correct).
4. **Validate:** `validate-historical-pricing.mts` + `validate-repair-scope.mts` (`confirmed_multi_un_count` should drop to 0 for wrong ops).

### Assessment

| | |
|---|---|
| **Scope** | 6 history rows + 2 catalog rows + 1 code function |
| **Risk** | Medium — chain reconciliation touches deltas across 3 ingredients |
| **Migration** | None |
| **Rollback** | History backup JSON + code revert |

---

## Option B — Data-only patch (not recommended)

Manual UPDATE April Atum `61c51696` → `new_price=6.29` + manual May rechaining.

**Without code fix, future multi-`un` purchases re-poison.**

| | |
|---|---|
| **Scope** | 1–2 rows manually |
| **Risk** | High recurrence |
| **Migration** | None |

---

## Option C — Full weight routing for `1 Kg` in name

Route all `1 Kg` countable lines to `g` base (`purchase_quantity=1000`).

Broader behavior change; higher regression risk for count-priced items.

| | |
|---|---|
| **Scope** | Code + all weight-in-name countable lines |
| **Risk** | High — may break legit count-priced items |
| **Migration** | None |

---

## Option D — Ignore

Only viable for Atum **catalog** today. History, alerts, Anchoas/Gema costing remain wrong.

| | |
|---|---|
| **Scope** | None |
| **Risk** | Ongoing wrong recipe costs for Anchoas/Gema |
| **Migration** | None |

---

## Expected post-repair state (Option A)

| Check | Expected |
|---|---|
| Atum Apr `61c51696` `new_price` | **6.29** |
| Atum May `781ab1ac` Δ% | **~+108%** |
| Anchoas/Gema history ops | Match true per-item unit prices |
| Anchoas/Gema catalog | Match latest confirmed purchase ops |
| `confirmed_multi_un_count` (wrong ops) | **0** |

---

## Recommendation

**Option A** — code fix first, then `reconcileIngredientPriceHistoryChain` × 3, then catalog refresh for Anchoas/Gema.
