# End-to-End Recipe Costing Certification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **2026-06-25T12:53:32.519Z**

## Certification Decision

### 🟡 CONDITIONALLY CERTIFIED

Validated **12** VL-E2E recipes (9 PASS / 3 FAIL). **31** ingredient lines PASS / **3** FAIL.

Recipe costing uses **invoice overlay → catalog → embed** via `resolveOperationalIngredientCostFields` / `effectiveIngredientUnitCostEur` — **never** `ingredient_price_history`.

**Confidence:** 67%

## Executive Summary

| Question | Answer |
|----------|--------|
| Total recipes validated | **12** |
| PASS / FAIL | **9 / 3** |
| Mathematical discrepancies | **3 recipe(s)** |
| Single operational source of truth? | **Yes** |
| Recipe recalculation after price change? | **Yes** |
| Uses Prosciutto/Ovo/Tomilho? | **No** |

## Foundation Pillars

| Pillar | Status |
|--------|--------|
| Procurement | 🟢 |
| Operational Normalization | 🟢 |
| Ingredient Catalog | 🟡 |
| Recipe Costing | 🟡 |
| Historical Pricing | 🟡 |
| Validation Engine | 🟢 |
| Matching | 🟡 |

## Coverage Matrix

| Recipe | Status | Lines | Food cost | Coverage | Notes |
|--------|--------|-------|-----------|----------|-------|
| Charcuterie kg | PASS | 2 | €3.83 | weight-kg, recipe-unit-kg | — |
| Countable Units | PASS | 2 | €56.17 | countable, recipe-unit-un | — |
| Dessert Nata | PASS | 3 | €14.12 | dessert, recipe-unit-un, recipe-unit-ml | — |
| Liquid ml/L | PASS | 3 | €1.18 | liquid-ml-L, recipe-unit-ml, recipe-unit-L | — |
| Multipack | FAIL | 2 | €2.33 | multipack, recipe-unit-un | Ginger beer: math: expected 0 actual 0; UI line cost mismatch; unresolved: recipe 6 un vs overlay/cost base mismatch |
| Pasta Stracciatella | PASS | 4 | €31.51 | mixed, recipe-unit-un, recipe-unit-g | — |
| Pasta with Sauce | PASS | 2 | €18.11 | mixed, sauce/prep, recipe-unit-un, recipe-unit-ml, sub-recipe | — |
| Pizza Margherita | FAIL | 4 | €17.17 | mixed, recipe-unit-kg, recipe-unit-un, recipe-unit-g | Manjericão: math: expected 0 actual 0; UI line cost mismatch; unresolved: recipe 12 g vs overlay/cost base mismatch |
| Salad Gorgonzola | FAIL | 4 | €0.64 | salad, recipe-unit-g, recipe-unit-ml | Salada ibérica: math: expected 0 actual 0; UI line cost mismatch; unresolved: recipe 100 g vs overlay/cost base mismatch |
| Sandwich Bresaola | PASS | 3 | €13.55 | mixed, recipe-unit-g, recipe-unit-un | — |
| Tomato Sauce | PASS | 3 | €22.30 | sauce/prep, recipe-unit-un, recipe-unit-g | — |
| Weight kg/g | PASS | 2 | €1.92 | weight-kg-g, recipe-unit-kg, recipe-unit-g | — |

## Methodology

1. **Phase 1** — Created 12 `VL-E2E` recipes covering kg/g, ml/L, un, multipack, mixed dishes, prep/sub-recipe
2. **Phase 2** — Traced invoice_items → matches → operational overlay → catalog → recipe lines
3. **Phase 3** — `recipe_qty × op_unit_cost = line_cost`; Σ lines = recipe total (tolerance €0.02)
4. **Phase 4** — UI replay: `enrichRecipeLinesForOperationalCost` + `resolveRecipeLineOperationalCost` + `computeRecipePricingSummaryFromRecipe` + PDF `buildTechnicalSheetIngredientsFromCostLines`
5. **Phase 5** — Confirmed `effectiveIngredientUnitCostEur` / `resolveOperationalIngredientCostFields`; no `ingredient_price_history` reads
6. **Phase 6** — Regression: Gorgonzola +10% on Salad → total increases by expected delta

## Regression Test

```json
{
  "tested": true,
  "recipe": "VL-E2E Salad Gorgonzola",
  "baselineTotalEur": 0.6432,
  "bumpedTotalEur": 0.683,
  "expectedDeltaEur": 0.0398,
  "actualDeltaEur": 0.0398,
  "pass": true
}
```

## Failed Lines (Issue Classification)

| Ingredient | Recipe | Class | Detail |
|------------|--------|-------|--------|
| Manjericão | Pizza Margherita | Recipe-layer bug | Invoice overlay `cost_base_unit=un` blocks g recipe lines |
| Salada ibérica | Salad Gorgonzola | Recipe-layer bug | Overlay `un` base; usable g conversion not applied |
| Ginger beer | Multipack | Recipe-layer bug | Overlay `ml` base; recipe `un` line unresolved |

No mathematical delta on resolved lines (all deltas €0.00). Failures are **unresolved line costs**, not wrong arithmetic.

## Remaining Foundation Blockers (not recipe-layer)

- Match read cutover (`VITE_MATCH_LIFECYCLE_READ_CUTOVER`) — UI display only
- Ovo/Tomilho history sync artifacts — not in any VL-E2E recipe
- Prosciutto suggested-match orphan history — not in any VL-E2E recipe

## Evidence

- Setup: `.tmp/end-to-end-recipe-certification/setup.mts`
- Audit: `.tmp/end-to-end-recipe-certification/audit.mts`
- Results: `.tmp/end-to-end-recipe-certification/results.json`
