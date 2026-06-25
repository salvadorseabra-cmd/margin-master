# Ginger Beer Final E2E Reality Check

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · **2026-06-25**

## Verdict

Ginger Beer **does not fail because Part 2 is wrong or VL data is stale**. Part 2 fixes line costing in `resolveRecipeLineOperationalCost` (€4.86 for 6 `un`), but the E2E replay’s **engine-total path** and **certification harness** still use `ingredientLineCostEur` on **enriched ml overlay fields** without the countable bridge. That produces a false line FAIL and a recipe total of €2.33 instead of €7.19.

| Question | Answer |
|----------|--------|
| Root cause (A–E) | **A** — bridge not executed on aggregation path |
| Implementation correct? | **Partial** — yes in `resolveRecipeLineOperationalCost`; no for totals |
| Replay wrong? | **Yes** — harness expected-cost + engine total bypass bridge |
| VL data stale? | **No** |
| Ginger Beer still fails E2E? | **Yes** (11/12) — line resolves but recipe/engine FAIL |
| Foundation 🟢 if fixed? | **No** — needs aggregation wiring + separate Prosciutto blocker |

**Confidence:** 94%

---

## Phase 1 — E2E Replay Code Path

```
audit.mts
  ├─ enrichRecipeLinesForOperationalCost
  │     └─ resolveOperationalIngredientCostFields → ml/200 overlay embedded in line.ingredients
  ├─ computeRecipeTotalCostEur (ENGINE TOTAL) ❌
  │     └─ computeRecipeLineCostEur
  │           └─ ingredientLineCostEur(qty, enriched.ingredients) — NO bridge
  ├─ resolveRecipeLineOperationalCost (UI + math actual) ✅
  │     └─ recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable → un/1 → €4.86
  ├─ ingredientLineCostEur(qty, resolved.fields) (harness expected) ❌
  └─ computeRecipePricingSummaryFromRecipe (summary) ❌ — same as engine path
```

`audit.mts` **does** call `resolveRecipeLineOperationalCost` (lines 339 and 409). Part 2 code **`recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable`** is present and runs there. It is **not** called from `computeRecipeLineCostEur` or `computeRecipeTotalCostEur`.

Production mirrors this split:

| Surface | Function | Bridge? |
|---------|----------|---------|
| Recipe detail lines | `getRecipeCostLines` → `resolveRecipeLineOperationalCost` | ✅ |
| Recipe list card total | `computeRecipePricingSummaryFromRecipe` | ❌ |

---

## Phase 2 — Unit Test vs E2E Inputs

All Ginger Beer inputs match between unit test, Part 2 verify script, and live VL trace:

| Field | Value |
|-------|-------|
| Ingredient | `7aa5dd9e-44c2-43e3-b673-890ad6d6da41` · Baladin Ginger Beer 0.20cl |
| Recipe line | 6 `un` |
| Catalog | `current_price=0.81`, `pq=24`, `cost_base_unit=un` |
| Invoice overlay | `current_price=0.81`, `pq=200`, `cost_base_unit=ml` |
| Invoice row | 24 `un` @ €0.81/bottle |

**First divergence:** after `resolveRecipeLineOperationalCost` returns €4.86, `computeRecipeLineCostEur` reads enriched `ingredients` (ml/200) and returns `null`.

Counter-example on same Multipack recipe: **Arroz agulha** (2 `un`) has invoice overlay `un` — aggregation path resolves €2.33 without bridge.

---

## Phase 3 — VL Live State

From `end-to-end-recipe-certification/results.json` (2026-06-25T13:52:50Z) and prior ginger-beer-resolution audit. Data is **current and consistent** — not stale.

| Artifact | Ginger Beer state |
|----------|-------------------|
| Confirmed match | `de0946a9-b7e4-467b-ae21-8b0401fcb363` |
| Overlay | ml / pq=200 / €0.81 |
| Catalog | un / pq=24 / €0.81 |
| Recipe line | 6 `un` in VL-E2E Multipack |

---

## Phase 4 — Execution Trace (Multipack)

| Step | Function | lineCost | Notes |
|------|----------|----------|-------|
| 1 | `resolveOperationalIngredientCostFields` | — | source=invoice, fields=ml/200 |
| 2 | `resolveRecipeLineOperationalCost` | **€4.86** | bridge → un/1, pricingResolved=true |
| 3 | `ingredientLineCostEur(resolved.fields)` | **null** | harness “expected” — ml vs un |
| 4 | `ingredientLineCostEur(enriched.ingredients)` | **null** | aggregation input |
| 5 | `computeRecipeLineCostEur` | **null** | ginger excluded |
| 6 | `computeRecipeTotalCostEur` | **€2.33** | arroz only |
| 7 | UI/PDF path (`resolveRecipeLineOperationalCost`) | **€7.19** | 4.86 + 2.33 |

Vitest reproduction: `.tmp/ginger-beer-final-e2e-check/aggregation-gap.test.ts` — bridge assertions pass; confirms gap.

Live `audit.mts` re-run **crashed** (pre-existing `import.meta.env` shim gap when trigger logging fires in child modules). Stale E2E results already captured the same economics post–Part 2.

---

## Phase 5 — Root Cause Classification

| Code | Applies? | Evidence |
|------|----------|----------|
| **A** Implementation not executed by replay | **✅ Primary** | Bridge only in `resolveRecipeLineOperationalCost`; engine/harness skip it |
| B Stale VL data | ❌ | Overlay/catalog/recipe match unit test |
| C Outdated replay script | ❌ | Script calls latest resolver; issue is dual code paths |
| D Real recipe-cost bug | ✅ Secondary | List/summary totals omit Ginger Beer |
| E Certification harness bug | ✅ Secondary | `expectedLineCost` uses `resolved.fields` not bridged fields |

**Selected: A** — Part 2 is implemented but not on the path that drives `computeRecipeTotalCostEur` and the harness expected-cost check.

**Smallest complete fix:** apply `recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable` inside `computeRecipeLineCostEur` (or centralize in a shared helper), and fix audit `expectedLineCost` to use the same bridged fields.

---

## Phase 6 — Foundation Impact

| Scenario | 12/12 recipes? | Foundation 🟢? |
|----------|----------------|----------------|
| Part 2 only (current) | **No** — engine €2.33 vs PDF €7.19 | No |
| + wire bridge into aggregation | **Yes** (Ginger unblocks) | Still **No** — Prosciutto match-lifecycle + Ovo/Tomilho sync remain |

---

## Parent Agent Return

1. **Root cause:** **A**
2. **Function/file:** `computeRecipeLineCostEur` → `src/lib/recipe-prep-cost.ts` (bypasses bridge in `resolve-operational-ingredient-cost.ts`)
3. **Implementation correct?** **Partial** — Yes for line resolver; No for recipe totals
4. **Replay wrong?** **Yes**
5. **VL data stale?** **No**
6. **Ginger Beer really still fails?** **Yes** at E2E bar; line cost resolves at €4.86
7. **Foundation 🟢 if resolved?** **No**
8. **Confidence:** **94%**

---

*Artifacts: `results.json`, `aggregation-gap.test.ts`, `debug-multipack.mts`*
