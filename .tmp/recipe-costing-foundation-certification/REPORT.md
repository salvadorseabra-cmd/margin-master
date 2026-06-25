# Recipe Costing Foundation Certification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25T12:40:06.921Z

## Certification Decision

### 🟡 CONDITIONALLY CERTIFIED

Audited **0** recipes (0 PASS / 0 FAIL). Recipe costing consumes **invoice overlay → catalog → embed** via `resolveOperationalIngredientCostFields` / `ingredientLineCostEur` — **never** `ingredient_price_history`.

**No VL recipes use Prosciutto, Ovo classe M, or Tomilho.**

**Confidence:** 72%

## Executive Summary

| Question | Answer |
|----------|--------|
| Total recipes audited | **0** |
| Recipe costing PASS / FAIL | **0 / 0** |
| Recipes affected by Prosciutto/Ovo/Tomilho? | **No** |
| Depends on historical pricing? | **No** (static code-path audit) |
| Single operational source of truth? | **Yes** |
| Foundation certification | **🟡** |

## Foundation Pillar Assessment (Recipe Costing Lens)

| Pillar | Status |
|--------|--------|
| Procurement | 🟢 |
| Operational Normalization | 🟢 |
| Ingredient Catalog | 🟢 |
| Recipe Costing | 🟢 |
| Historical Pricing | 🟡 |
| Validation Engine | 🟢 |
| Matching | 🟡 |

## Per-Recipe Summary

| Recipe | Status | Lines | Food cost € | Flagged ing. | Notes |
|--------|--------|-------|-------------|--------------|-------|
| _(no recipes)_ | — | — | — | — | — |

## 8-Check Methodology

1. **Recipe Definition** — ingredient/prep exists, quantity > 0, unit present
2. **Ingredient Source Trace** — confirmed match → invoice line → normalization → catalog/overlay
3. **Operational Cost = Ingredient Detail catalog** — `effectiveIngredientUnitCostEur(catalog)` vs recipe resolved op
4. **Math Reconstruction** — `ingredientLineCostEur` sums to `computeRecipeTotalCostEur` / `deriveRecipePricingSummary`
5. **Foundation Cross-Check** — flagged Prosciutto/Ovo/Tomilho: recipe op matches latest line op despite catalog/history defects
6. **Historical Independence** — recipe modules do not import or read `ingredient_price_history`
7. **UI Consistency** — replays `enrichRecipeLinesForOperationalCost` + `computeRecipePricingSummaryFromRecipe` (recipes.tsx path)
8. **Architecture** — cost source ∈ {invoice, catalog, embed}; invoice wins over stale catalog

## Flagged Ingredient Usage

| Ingredient | ID | In any recipe? |
|------------|-----|----------------|
| Prosciutto cotto scelto | `b924480a-91f3-4aa2-9852-a900795a6f92` | **No** |
| Ovo classe M | `9f167402-9ea8-4fac-92dc-2cb11a525359` | **No** |
| Tomilho | `ac8a9cc3-66cd-4a77-95cb-a3c8104b7041` | **No** |

## Architecture Evidence (Static Code-Path Audit)

| Check | Result |
|-------|--------|
| Recipe modules import `ingredient_price_history`? | **No** |
| Operational cost formula | `current_price / purchase_quantity` via `resolvedOperationalUnitCostEur` |
| Source precedence | invoice overlay → catalog → embed (`resolveOperationalIngredientCostFields`) |
| UI recipes path | `enrichRecipeLinesForOperationalCost` + `computeRecipePricingSummaryFromRecipe` |
| Ingredient detail path | `effectiveIngredientUnitCostEur` on catalog row |
| VL live dish data | **0 recipes / 0 recipe_ingredients** |

Prior foundation closure noted catalog-stale denominators on Ovo/Tomilho would block recipe costing **if referenced** — neither appears in any VL recipe line.

## Evidence

- Code: `src/lib/recipe-prep-cost.ts`, `src/lib/ingredient-unit-cost.ts`, `src/lib/resolve-operational-ingredient-cost.ts`
- Prior foundation: `.tmp/foundation-final-closure/REPORT.md`, `.tmp/foundation-certification/REPORT.md`
- Replay: `.tmp/recipe-costing-foundation-certification/audit.mts`

## Conclusion

VL has no recipes — recipe costing pipeline is architecturally sound but untested on live dish data.
