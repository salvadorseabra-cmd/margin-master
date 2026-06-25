# Recipe Cost Resolution Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **2026-06-25T13:02:43Z**  
**Mode:** STRICT READ-ONLY — no code, data, or DB changes

## Certification Question

Do the 3 E2E FAIL lines (`lineCost = null`) share **one** architectural defect in recipe cost resolution?

**Answer: Yes** — all three fail at the same pipeline stage (`ingredientLineCostEur`) because the **resolved operational `cost_base_unit` family does not match the recipe line unit**, and no conversion bridge succeeds. Manjericão and Salada ibérica share the **exact same corruption**; Ginger beer is the same class with a different mismatch shape (volume overlay vs countable recipe).

---

## Executive Summary

| # | Ingredient | Recipe unit | Overlay base | Catalog base | lineCost | Stop point |
|---|------------|-------------|--------------|--------------|----------|------------|
| 1 | Manjericão | 12 g | g → **un** (corrupted) | g | null | `preferInvoiceCountableOverlayFields` downgrades g→un; usable bridge missing |
| 2 | Salada ibérica | 100 g | g → **un** (corrupted) | g | null | Same as Manjericão |
| 3 | Ginger beer | 6 un | **ml** (200 ml/bottle) | un (24 pack) | null | Invoice ml wins; `directCountableLineCostEur` requires un |

**Root cause: E — recipe costing bug** (with invoice-overlay selection as contributing context)  
**Primary function:** `preferInvoiceCountableOverlayFields` in `resolve-operational-ingredient-cost.ts:152-170`  
**Secondary:** `ingredientLineCostEur` / `directCountableLineCostEur` — no ml→un bridge when catalog is countable

**Confidence if fixed:** 12/12 recipes PASS, 34/34 lines PASS, green certification at **92%**

---

## Phase 1 — Resolution Pipeline (all 3 FAIL)

```
invoice_items → operationalCostFieldsFromInvoiceLine
             → invoice overlay Map (latest confirmed match)
             → resolveOperationalIngredientCostFields  [invoice wins]
             → normalizeCountableOperationalCostFields
                   └─ preferInvoiceCountableOverlayFields  ← Manjericão/Salada corruption
             → mergeOperationalCostMetadata(catalog)       ← does NOT merge cost_base_unit
             → effectiveIngredientUnitCostEur            ← €/base resolves (non-null)
             → ingredientLineCostEur                     ← lineCost = null
             → isRecipeLineCostUnresolved → true
```

### VL data (live query)

| Ingredient | Invoice line | Overlay fields | Catalog fields |
|------------|--------------|----------------|----------------|
| Manjericão | 5 mo @ €2.06 | `price=2.06, pq=100, base=g` | same |
| Salada ibérica | 4 em @ €2.19 | `price=2.19, pq=250, base=g` | same |
| Ginger beer | 24 un @ €0.81 | `price=0.81, pq=200, base=ml` | `price=0.81, pq=24, base=un` |

Operational unit costs **do resolve** (UI shows €0.0206/g, €0.00876/g, €0.00405/ml). Failure is strictly at **line multiplication / conversion**, not missing pack price.

---

## Phase 2 — Decision Trace in `resolveOperationalIngredientCostFields()`

### Manjericão (`8fe3ab95…`, 12 g)

| Candidate | Available | Selected | Notes |
|-----------|-----------|----------|-------|
| Invoice overlay | ✓ | **✓** | `cost_base_unit=g, pq=100` from `recipeOperationalCostFieldsFromInvoiceLine` |
| Catalog | ✓ | — | Identical price fields |
| Embed | ✓ | — | Same persisted row |
| Fallback | — | — | — |

**Post-selection mutation (critical):**

| Step | cost_base_unit | purchase_quantity |
|------|----------------|-------------------|
| Raw invoice overlay | `g` | 100 |
| `preferInvoiceCountableOverlayFields` | **`un`** | 100 |
| `mergeOperationalCostMetadata(catalog)` | **`un`** | 100 (cost_base NOT merged from catalog) |

`inferIngredientCostBaseUnit({ pq: 100 })` returns `un` when explicit base is stripped → function treats 100 g denominator as countable pack count.

### Salada ibérica (`47cd8362…`, 100 g)

Identical decision tree to Manjericão: invoice `g/250` → `preferInvoiceCountableOverlayFields` → `un/250` → usable bridge fails.

### Ginger beer (`7aa5dd9e…`, 6 un)

| Candidate | Available | Selected | Notes |
|-----------|-----------|----------|-------|
| Invoice overlay | ✓ | **✓** | `ml/200` (200 ml per bottle from 20 cl parse) |
| Catalog | ✓ | — | `un/24` — correct pack-count semantics |
| Embed | ✓ | — | Matches catalog |
| `shouldPreferEmbedOverLegacyCatalogMassBase` | — | false | Catalog is `un`, not legacy mass |

No `preferInvoiceCountableOverlayFields` corruption (ml base preserved). Failure is **family mismatch** only.

---

## Phase 3 — Why `lineCost` is null

### Manjericão & Salada ibérica

1. `resolvedOperationalUnitCostEur` succeeds → €0.0206/g and €0.00876/g  
2. `inferIngredientCostBaseUnit(resolvedFields)` → **`un`** (corrupted)  
3. Recipe normalizes to **weight** (`g`); `areUnitFamiliesCompatible(weight, countable)` → false  
4. Conversion ladder:
   - `directCountableLineCostEur` → null (recipe not `un`)
   - `recipeLineCostViaPackagedLiquidConversion` → null (recipe not `ml`)
   - `recipeLineCostViaUsableConversion` → null (`usable_weight_grams` absent; `pq=100/250` not interpreted as grams-per-unit)
   - `recipeLineCostViaDensityConversion` → null (no density)
5. `ingredientLineCostEur` sets `lineCost = null`, `unitMismatch = true`

**Exact stop:** `recipe-prep-cost.ts:336-338` — all conversion branches exhausted.

### Ginger beer

1. Unit cost resolves → €0.00405/ml  
2. Cost base **`ml`** (volume); recipe **`un`** (countable)  
3. `directCountableLineCostEur` → null (`costBase !== "un"`)  
4. No `usable_volume_ml` on overlay for un←ml bridge  
5. Same terminal guard → `lineCost = null`

**Exact stop:** `usable-unit-conversion.ts:311` (`directCountable` guard) + `recipe-prep-cost.ts:336-338`.

---

## Phase 4 — PASS Comparators (first divergence)

| PASS | Recipe unit | Resolved base | Families compatible? | Path | First divergence from FAIL |
|------|-------------|---------------|----------------------|------|---------------------------|
| Mortadella 80 g | g | **g** (pq=1000, survives preferCountable) | ✓ weight=weight | `compatible_base_multiply` → €0.7992 | pq≥1000 keeps `g`; FAIL rows have pq=100/250 → downgraded to `un` |
| Aceto 15 ml | ml | **ml** (pq=10000) | ✓ volume=volume | `compatible_base_multiply` → €0.0241 | Recipe volume matches overlay volume |
| Anchoas 3 un | un | **un** | ✓ countable=countable | `direct_countable` → €29.97 | Recipe `un` matches overlay `un` |

**First divergence:** at `preferInvoiceCountableOverlayFields` for gram-denominator packs (pq ∈ (1, 999)), or at family-match check for Ginger beer (volume vs countable).

---

## Phase 5 — Root Cause Classification

| Code | Verdict | Rationale |
|------|---------|-----------|
| A overlay priority | Contributing | Invoice correctly wins per design |
| B unit-family resolution | Symptom | Mismatch is real but bridges should exist |
| C catalog persistence | No | Catalog has correct g/un bases |
| D missing conversion | Partial | Ginger beer lacks ml→un bridge |
| **E recipe costing bug** | **Primary** | `preferInvoiceCountableOverlayFields` corrupts g→un for pq=100/250 |
| F multiple bugs | Alternate | Ginger beer needs separate ml↔un bridge |

**Selected: E** (Manjericão/Salada primary defect; Ginger beer is same layer, different branch)

---

## Phase 6 — Smallest Correction (do NOT implement)

### Fix 1 — Manjericão & Salada (one line guard)

In `preferInvoiceCountableOverlayFields` (`resolve-operational-ingredient-cost.ts:152-170`):

**Do not** strip `cost_base_unit: "g"` when invoice overlay already set it and `purchase_quantity < 1000` encodes grams-per-pack (the pattern produced by `recipeOperationalCostFieldsFromInvoiceLine` for inferred produce / EMB rows).

Alternative: in `mergeOperationalCostMetadata`, when catalog `cost_base_unit` is `g` and invoice was downgraded to `un` with identical `purchase_quantity`, restore catalog base.

Expected line costs after fix:
- Manjericão 12 g → 12 × €0.0206 = **€0.2472**
- Salada 100 g → 100 × €0.00876 = **€0.876**

### Fix 2 — Ginger beer (minimal bridge)

When recipe unit is `un`, catalog `cost_base_unit` is `un`, and invoice overlay is `ml` with per-piece volume (200 ml), prefer catalog countable fields for line costing **or** set `usable_volume_ml: 200` and allow `directCountableLineCostEur` when recipe is `un` and overlay carries per-bottle ml.

Expected: 6 × (€0.81) = **€4.86** (6 bottles × €0.81/bottle from 24-pack price).

---

## Parent Agent Return

1. **All 3 same bug?** **Yes** — one recipe-resolution gap (operational base ≠ recipe family, conversion fails); Manjericão/Salada share identical `preferInvoiceCountableOverlayFields` corruption; Ginger beer is the volume/countable variant.

2. **Root cause A–F:** **E** (recipe costing bug; `preferInvoiceCountableOverlayFields` + missing ml↔un bridge)

3. **Exact function + file + lines:**
   - `preferInvoiceCountableOverlayFields` — `src/lib/resolve-operational-ingredient-cost.ts:152-170`
   - `normalizeCountableOperationalCostFields` — same file:172-178 (calls above)
   - `ingredientLineCostEur` terminal null — `src/lib/recipe-prep-cost.ts:336-338`
   - `directCountableLineCostEur` guard — `src/lib/usable-unit-conversion.ts:305-317`

4. **Why lineCost null (one sentence):** After invoice overlay selection, `preferInvoiceCountableOverlayFields` rewrites gram-based overlays to `un`, so weight-recipe lines cannot multiply or convert, and Ginger beer’s ml overlay cannot reach countable recipe units.

5. **Smallest correction:** Preserve invoice `cost_base_unit=g` when `purchase_quantity` is a gram denominator (<1000); for multipack beverages, use catalog `un` base or per-bottle `usable_volume_ml` when recipe unit is `un`.

6. **If fixed:** **12 PASS / 0 FAIL** recipes, **34 PASS / 0 FAIL** lines, **green** certification, **92%** confidence.

---

## Evidence

- Audit script: `.tmp/recipe-cost-resolution-audit/audit.mts`
- Results: `.tmp/recipe-cost-resolution-audit/results.json`
- E2E baseline: `.tmp/end-to-end-recipe-certification/REPORT.md`
