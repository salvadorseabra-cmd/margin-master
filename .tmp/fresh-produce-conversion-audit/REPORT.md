# Fresh Produce Conversion Coverage Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments
**Generated:** 2026-06-24T01:17:52.878Z

---

## Executive Summary

VL corpus: **2** invoice_items with unit `mo` (bunch), **2** unique products. PRODUCE_CONVERSION_HINTS defines **16** tokens across 3 groups (leafy 500g, fresh herbs 100g, whole vegetable 700g). Among target herbs, **5** have hints; **3** do not (ALECRIM, ESTRAGAO, TOMILHO). Tomilho vs Manjericão diverge at **detectConversionHint(name)**. Blast radius if Tomilho-class hint applied to all missing herb bunch rows: **1** rows.

**FINAL VERDICT: A** — Only Tomilho among VL mo-bunch herb rows lacks operational conversion. VL mo corpus is Tomilho (MISSING) + Manjericão (SAFE). Code table also omits ALECRIM/ESTRAGAO but those are untriggered in VL.

**Is Tomilho one-off or larger coverage problem?** Tomilho is an isolated missing-hint case among VL herb bunch purchases.

---

## TASK 1 — PRODUCE_CONVERSION_HINTS Inventory

| Ingredient Token | Conversion | Unit | Source File |
|------------------|------------|------|-------------|
| ALFACE | 500 | g | src/lib/ingredient-unit-inference.ts |
| LETTUCE | 500 | g | src/lib/ingredient-unit-inference.ts |
| RUCULA | 500 | g | src/lib/ingredient-unit-inference.ts |
| ARUGULA | 500 | g | src/lib/ingredient-unit-inference.ts |
| AGRIAO | 500 | g | src/lib/ingredient-unit-inference.ts |
| ESPINAFRE | 500 | g | src/lib/ingredient-unit-inference.ts |
| COUVE | 500 | g | src/lib/ingredient-unit-inference.ts |
| COENTROS | 100 | g | src/lib/ingredient-unit-inference.ts |
| SALSA | 100 | g | src/lib/ingredient-unit-inference.ts |
| MANJERICAO | 100 | g | src/lib/ingredient-unit-inference.ts |
| HORTELA | 100 | g | src/lib/ingredient-unit-inference.ts |
| CEBOLINHO | 100 | g | src/lib/ingredient-unit-inference.ts |
| BROCOLOS | 700 | g | src/lib/ingredient-unit-inference.ts |
| COUVE-FLOR | 700 | g | src/lib/ingredient-unit-inference.ts |
| COUVE FLOR | 700 | g | src/lib/ingredient-unit-inference.ts |
| REPOLHO | 700 | g | src/lib/ingredient-unit-inference.ts |

### Target Herb Probe

| Token | Display Name | In Table | detectConversionHint |
|-------|--------------|----------|----------------------|
| MANJERICAO | Manjericão | yes | 100g (fresh herbs) |
| SALSA | Salsa | yes | 100g (fresh herbs) |
| COENTROS | Coentros | yes | 100g (fresh herbs) |
| HORTELA | Hortelã | yes | 100g (fresh herbs) |
| ALECRIM | Alecrim | no | null |
| CEBOLINHO | Cebolinho | yes | 100g (fresh herbs) |
| ESTRAGAO | Estragão | no | null |
| TOMILHO | Tomilho | no | null |

---

## TASK 2 — Coverage Analysis

| Ingredient Group | Conversion | Operational Unit | Category | Tokens |
|------------------|------------|------------------|----------|--------|
| leafy produce | 500g | kg | Vegetables | ALFACE, LETTUCE, RUCULA, ARUGULA, AGRIAO, ESPINAFRE, COUVE |
| fresh herbs | 100g | kg | Herbs | COENTROS, SALSA, MANJERICAO, HORTELA, CEBOLINHO |
| whole vegetable | 700g | kg | Vegetables | BROCOLOS, COUVE-FLOR, COUVE FLOR, REPOLHO |

### Category Counts (tokens)

- **Vegetables:** 11
- **Herbs:** 5
- **Fruit:** 0

---

## TASK 3 — VL Corpus (mo/maço/bunch purchases)

Total invoice_items: 52; bunch-unit rows: 2

| Product | Parsed Conversion? | Operational Visible? | Source | Status |
|---------|-------------------|----------------------|--------|--------|
| Tomilho | no | no | invoice_items | MISSING |
| Manjericão | yes | yes | invoice_items | SAFE |

Herb bunch subset: 2 rows — SAFE 1, MISSING 1
Missing herb products: Tomilho

### Broader VL Fresh Produce (all units)

| Product | Unit | Parsed Conversion? | Operational Visible? | Status |
|---------|------|-------------------|----------------------|--------|
| Tomilho | mo | no | no | MISSING |
| Salada Ibérica FSTK EMB. 250g | em | yes | yes | SAFE |
| Manjericão | mo | yes | yes | SAFE |
| Hortelã | kg | yes | yes | SAFE |
| Pepino | kg | yes | yes | SAFE |

Code-level herb token gap (latent): ALECRIM, ESTRAGAO, TOMILHO absent from PRODUCE_CONVERSION_HINTS; only TOMILHO triggered in VL.

---

## TASK 4 — Tomilho Root Cause vs Manjericão

| Stage | Tomilho | Manjericão | Diverges |
|-------|---------|------------|----------|
| invoice_item.unit | mo | mo | no |
| detectConversionHint(name) | null | {"purchase_unit":"un","estimated_quantity":100,"stock_unit":"g","recipe_usage_un | **yes** |
| resolveInvoiceLinePurchaseFormat.kind | row_only | inferred | **yes** |
| normalizedUsableQuantity | null | 500 | **yes** |
| resolveUsablePerPricedUnit | null | {"amount":100,"unit":"g"} | **yes** |
| computeEffectiveUsableCost | null | {"cost":20.599999999999998,"unit":"kg"} | **yes** |
| effectiveUsableCostLabel | null | €20.60 / kg | **yes** |
| recipeOperationalCostFieldsFromInvoiceLine | {"current_price":2.06,"purchase_quantity":1,"cost_base_unit":"un"} | {"current_price":2.06,"purchase_quantity":100,"cost_base_unit":"g"} | **yes** |

**First divergence:** detectConversionHint(name)

Exact path: detectConversionHint: Tomilho → null (TOMILHO not in PRODUCE_CONVERSION_HINTS); Manjericão → MANJERICAO token → 100g/bunch → structured.kind=inferred → €/kg operational

---

## TASK 5 — Architectural Intent

**Selected: D** — Architecture ambiguity — hints are lightweight/estimated, intentionally not persisted; no rule mandates all mo herbs get €/kg

Evidence:
- ingredient-unit-inference.ts L426-429: hints are 'lightweight operational hints' 'intentionally not persisted automatically because the schema has no field for estimated usable yield'
- invoice-purchase-format.test.ts: estimated_yield renderSource for ALFACE without explicit pack — partial token coverage by design
- stock-normalization.test.ts: 'does not invent usable weight without shorthand or match signal' for Tomate cherry
- No test asserts all mo-unit herbs must match PRODUCE_CONVERSION_HINTS; Manjericão path tested via formatRowPurchaseQuantityLabel only

---

## TASK 6 — Blast Radius

If Tomilho received Manjericão-class hint (100g/bunch → €/kg), **1** VL herb bunch rows would gain operational cost:
- Tomilho

All MISSING mo-bunch rows (any product): **1** across 1 products.

---

## Required Table

| Ingredient | Purchase Unit | Conversion | Operational Unit | Status |
|------------|---------------|------------|------------------|--------|
| Tomilho | mo | — | — | MISSING |
| Manjericão | mo | 100 g/bunch | kg | SAFE |

---

## FINAL VERDICT

**A** — Only Tomilho among VL mo-bunch herb rows lacks operational conversion. VL mo corpus is Tomilho (MISSING) + Manjericão (SAFE). Code table also omits ALECRIM/ESTRAGAO but those are untriggered in VL.

**Question:** Is Tomilho one-off or larger coverage problem?
**Answer:** Tomilho is an isolated missing-hint case among VL herb bunch purchases.

## Evidence Files

- `.tmp/fresh-produce-conversion-audit/results.json`
- `.tmp/fresh-produce-conversion-audit/audit.mts`
- Prior: `.tmp/tomilho-audit/REPORT.md`