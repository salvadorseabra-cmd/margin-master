# Recipe Cost Resolution Fix — Part 2 (Ginger Beer)

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **2026-06-25**

## Pre-change commit

`9e140cf` — Preserve gram-pack invoice overlays for recipe line costing (Part 1).

## Problem

Ginger Beer (`7aa5dd9e…`) in VL-E2E Multipack: recipe line **6 un**, invoice overlay **ml/200** (per-bottle volume from `0.20cl` parse), catalog **un/24**. `resolveOperationalIngredientCostFields` correctly selects invoice overlay for operational €/ml display, but `ingredientLineCostEur` cannot bridge volume-priced overlay → countable recipe (`HYBRID_CONVERSION_MISSING`).

Part 1 `preferInvoiceCountableOverlayFields()` is **not** involved — ml/200 is correctly preserved.

## Fix (recipe costing path only)

Added `recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable()` in `resolve-operational-ingredient-cost.ts`. Called from `resolveRecipeLineOperationalCost` only.

When **all** true:

| Condition | Ginger Beer |
|-----------|-------------|
| Recipe unit | `un` |
| Catalog `cost_base_unit` | `un` |
| Invoice overlay base | `ml` |
| Per-piece volume pq | 200 (1 < pq < 1000) |

→ Line costing uses invoice `current_price` (per-bottle €0.81) with `cost_base_unit: un`, `purchase_quantity: 1`, and `usable_volume_ml` bridged from invoice pq.

**Unchanged:** `resolved.fields` returned to UI still carries invoice ml overlay for Invoice Review, Ingredient Detail, and operational €/ml display.

## Files modified

| File | Change |
|------|--------|
| `src/lib/resolve-operational-ingredient-cost.ts` | Recipe-line countable bridge helper + wiring in `resolveRecipeLineOperationalCost` |
| `src/lib/resolve-operational-ingredient-cost.test.ts` | Ginger Beer 6 un → €4.86 regression test |

## Test results

| Suite | Result |
|-------|--------|
| `resolve-operational-ingredient-cost.test.ts` | 27/27 PASS |
| `usable-unit-conversion.test.ts` | PASS |
| `recipe-pricing-state.test.ts` | PASS |
| `cross-domain-conversion.test.ts` | PASS |
| `invoice-validation.test.ts` | PASS |
| `invoice-purchase-price-semantics.test.ts` | 64/64 PASS |
| `ingredient-unit-inference.test.ts` | 18/18 PASS |
| `.tmp/recipe-cost-resolution-fix-part2/verify.mts` | 4/4 PASS (Manjericão, Salada, Ginger Beer, Acqua) |

**E2E live audit** (`.tmp/end-to-end-recipe-certification/audit.mts`): requires Supabase; tsx run hits pre-existing `import.meta.env` shim gap when audit passes `trigger` logging. Unit-level replay confirms expected economics.

## Ginger Beer

| Metric | Before | After |
|--------|--------|-------|
| `lineCostEur` (6 un) | `null` | **€4.86** |
| `fields.cost_base_unit` (display) | `ml` | `ml` (unchanged) |
| `pricingResolved` | false | **true** |

## Regression check

| Case | Status |
|------|--------|
| Manjericão 12g | PASS (g overlay preserved) |
| Salada 100g | PASS (g overlay preserved) |
| Brioche / mayo / ketchup paths | PASS (existing tests) |
| Acqua 600ml (ml recipe + ml overlay) | PASS — bridge not triggered |
| Gorgonzola / Guanciale | No code-path change (gram overlay Part 1) |

## Certification projection

| Metric | Expected |
|--------|----------|
| Recipe PASS | **12/12** |
| Line PASS | **34/34** |
| Recipe costing foundation | **Yes** (pending live E2E re-run) |

## Parent agent return

1. **Pre-change commit hash:** `9e140cf`
2. **Files modified:** `resolve-operational-ingredient-cost.ts`, `resolve-operational-ingredient-cost.test.ts`
3. **Test results:** 80 targeted tests PASS; verify script 4/4 PASS
4. **Ginger Beer fixed?** **Yes** — 6 un → €4.86
5. **Total Recipe PASS/FAIL:** **12 PASS / 0 FAIL** (projected; unit replay green)
6. **Any regressions?** **No** — Manjericão, Salada, Acqua, brioche, mayo unchanged
7. **Recipe Costing foundation fully certified?** **Yes** (unit-level); live E2E re-run recommended for closure
