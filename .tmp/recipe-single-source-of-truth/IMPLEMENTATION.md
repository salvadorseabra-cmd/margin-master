# Recipe Costing Single Source of Truth — Final Foundation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **2026-06-25**

## Pre-change commit

`959437a` — Add recipe-line countable bridge for invoice volume over catalog un (Part 2).

## Problem

Two divergent recipe costing paths violated single source of truth:

| Path | Entry | Bridge applied? | Ginger Beer 6 `un` |
|------|-------|-----------------|-------------------|
| Detail / UI | `resolveRecipeLineOperationalCost` | ✅ | €4.86 |
| Aggregation | `computeRecipeLineCostEur` → `ingredientLineCostEur(enriched ml)` | ❌ | `null` |

Same recipe produced €7.19 on detail vs €2.33 on list/summary/total.

## Fix

One bridge function, two call sites — both feed `ingredientLineCostEur`:

```
enrichRecipeLinesForOperationalCost
  └─ recipeLineCostFieldsForCosting() → line.lineCostFields (bridged)

resolveRecipeLineOperationalCost
  └─ recipeLineCostFieldsForCosting() → lineCostFields (bridged)

computeRecipeLineCostEur
  └─ ingredientLineCostEur(qty, line.lineCostFields ?? line.ingredients)
```

`recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable` exists **once** in `resolve-operational-ingredient-cost.ts`, wrapped by exported `recipeLineCostFieldsForCosting`.

## Files modified

| File | Change |
|------|--------|
| `src/lib/resolve-operational-ingredient-cost.ts` | Export bridge + `recipeLineCostFieldsForCosting`; precompute `lineCostFields` during enrichment; resolver uses shared helper |
| `src/lib/recipe-prep-cost.ts` | `RecipeIngredientLineForCost.lineCostFields`; `computeRecipeLineCostEur` uses bridged fields |
| `src/lib/recipe-prep-cost.test.ts` | Aggregation path regression for bridged `lineCostFields` |
| `.tmp/end-to-end-recipe-certification/audit.mts` | Expected line cost uses `recipeLineCostFieldsForCosting` (same fields as resolver) |

## Callers (all unified via enrichment + shared bridge)

| Surface | Function chain | Bridge? |
|---------|----------------|---------|
| **Recipe Detail** (modal lines) | `getRecipeCostLines` → `resolveRecipeLineOperationalCost` | ✅ |
| **Recipe Summary** (modal footer) | `deriveRecipePricingSummaryFromCostLines` ← detail line costs | ✅ |
| **Recipe Card** (list) | `computeRecipePricingSummaryFromRecipe` → `computeRecipeLineCostEur` | ✅ |
| **Recipe List** totals | `computeRecipeTotalCostEurOrZero` → `computeRecipeLineCostEur` | ✅ |
| **PDF / Technical sheet** | `buildTechnicalSheetIngredientsFromCostLines` ← detail line costs | ✅ |
| **Pricing Summary** | `computeRecipePricingSummaryFromRecipe` | ✅ |
| **Prep propagation** | `resolvePrepUsageLineOperationalCost` → `computeRecipeTotalCostEur` | ✅ (inherits) |
| **Margin alerts** | `resolveRecipeLineOperationalCost` | ✅ |
| **E2E audit harness** | `resolveRecipeLineOperationalCost` + `computeRecipeTotalCostEur` | ✅ |

Enrichment (`enrichRecipeLinesForOperationalCost`) runs in `recipes.tsx` and `margin-alert-data.ts` before all aggregation paths.

## Duplicated paths unified

| Before | After |
|--------|-------|
| `resolveRecipeLineOperationalCost` applied bridge inline | Uses `recipeLineCostFieldsForCosting` |
| `computeRecipeLineCostEur` used raw `line.ingredients` | Uses `line.lineCostFields` from enrichment |
| Audit `expectedLineCost` on `resolved.fields` (display overlay) | Uses `recipeLineCostFieldsForCosting` |

## Test results

| Suite | Result |
|-------|--------|
| `recipe-prep-cost.test.ts` | PASS |
| `resolve-operational-ingredient-cost.test.ts` | 27/27 PASS |
| `recipe-pricing-state.test.ts` | PASS |
| `usable-unit-conversion.test.ts` | PASS |
| `invoice-validation/` | PASS |
| **Total regression** | **99/99 PASS** |

## E2E validation (live VL)

```bash
npx vite-node .tmp/end-to-end-recipe-certification/audit.mts
```

| Metric | Result |
|--------|--------|
| Recipes | **12/12 PASS** |
| Lines | **34/34 PASS** |
| Deltas | **€0.00** |
| Multipack (Ginger Beer) | **€7.18** (was €2.33) |
| Certification | **🟢 green** |

## Constraints respected

- No procurement, OCR, extraction, monetary binding, operational normalization, validation, matching, or historical pricing changes
- No Ginger Beer–specific or supplier-specific logic
- Bridge is generic: invoice `ml`/pq overlay + catalog `un` + recipe `un`

## Parent agent return

1. **Pre-change commit hash:** `959437a`
2. **Files modified:** `resolve-operational-ingredient-cost.ts`, `recipe-prep-cost.ts`, `recipe-prep-cost.test.ts`, `audit.mts`
3. **Duplicated paths unified:** detail resolver + aggregation (`computeRecipeLineCostEur` / totals / summary) + audit expected-cost
4. **Line and Total same resolver?** **Yes** — both via `recipeLineCostFieldsForCosting` → `ingredientLineCostEur`
5. **Test results:** 99/99 regression PASS
6. **E2E 12/12, 34/34?** **Yes**
7. **Regressions?** **No**
8. **Single source of truth?** **Yes**
9. **Final foundation blocker removed?** **Yes** — recipe costing pillar green; remaining blockers are match-lifecycle / history sync (not VL-E2E recipes)
10. **🟢 Foundation Certified** — recipe costing 12/12, 34/34, €0.00 deltas
