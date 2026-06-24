# Salada Ibérica Operational Semantics Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24T00:13:31.834Z

---

## Executive Summary

Salada Ibérica FSTK EMB. 250g (4 packs @ €2.19/pack) exhibits a **split semantics model**: procurement correctly shows **€2.19 / pack**, but the Ingredient Detail **Operational Cost** display shows **€2.19 / case** via `isCaseRowWithEmbeddedPieceWeightOnly` → `computeEffectiveUsableCost` hardcoded `unit: "case"`. Recipe costing and persistence use a **different path**: `recipeOperationalCostFieldsFromInvoiceLine` → `cost_base_unit: "g"`, `purchase_quantity: 250`, yielding **€0.00876/g** (display **€8.76/kg**).

**FINAL VERDICT: A** — Operational Cost display label is wrong (shows 'case' instead of €/kg or pack-equivalent weight cost), but recipe costing uses correct gram-based denominator (€2.19/250g). Numeric €2.19 matches pack price — suffix 'case' is the bug, not the persisted cost basis.

---

## Required Table: Concept | Current | Intended by Architecture

| Concept | Current | Intended by Architecture |
|---------|---------|--------------------------|
| Purchase Unit | pack (invoice row unit `em`, qty 4 → '4 packs') | pack — invoice procurement unit is the priced container (EM = embalagem/pack); formatRowPurchaseQuantityLabel maps em → pack |
| Procurement Unit | pack (€2.19 / pack via resolvePriceSuffix em→pack) | pack — procurement display reflects what was paid per invoice line container (ROW_UNIT_PRICE_SUFFIX['em'] = 'pack') |
| Operational Unit | case (display: €2.19 / case via isCaseRowWithEmbeddedPieceWeightOnly shortcut) | kg (display) / g (internal cost_base_unit) — weight-family EMB products with embedded g should derive €/kg operational display from pack price ÷ usable grams; recipe layer persists cost_base_unit=g, purchase_quantity=250 |
| Recipe Consumption Unit | g (RECIPE_USAGE_UNIT_OPTIONS includes g/kg; persisted purchase_quantity=250, cost_base_unit=g) | g (or kg in UI) — recipe costing uses effectiveIngredientUnitCostEur = current_price / purchase_quantity with gram denominator for weight-family pack rows |

---

## Architecture Question

**Invoice → Procurement → Operational → Recipe Cost**

For EMB 250g products, Marginly's **recipe/persistence layer** treats them as **weight-family** (`inferUnitFamily("em", { usableQuantityUnit: "g" }) → "weight"`), storing pack price over grams-per-pack. Recipes should consume **grams (B)** or **kilograms (C)** in the UI — not packs or cases.

The **display operational cost** path reuses an Angus-style `cx` shortcut (`isCaseRowWithEmbeddedPieceWeightOnly`) that hardcodes `case` — this is a **presentation-layer** divergence from the recipe cost model.

---

## Key Question: Given 4 packs, 250g each, €2.19/pack — what should Operational Cost display?

| Layer | Expected per architecture | Salada actual |
|-------|---------------------------|---------------|
| Procurement | €2.19 / pack | €2.19 / pack ✓ |
| Operational display | €8.76 / kg (= €2.19 ÷ 0.25 kg) | €2.19 / case ✗ (wrong suffix; same numeric value as pack) |
| Recipe persistence | current_price=2.19, purchase_quantity=250, cost_base_unit=g | ✓ matches |
| 100g recipe line cost | 100 × (2.19/250) = **€0.876** | €0.876 |

---

## Recipe 100g Answer

**If a recipe uses 100g of Salada Ibérica, what operational cost model is Marginly intending to apply?**

Marginly applies **gram-denominated operational costing**: `ingredientLineCostEur(100, fields, { recipeUnit: "g" })` = `100 × (current_price / purchase_quantity)` = `100 × (2.19 / 250)` ≈ **€0.876**. The model is **not** €2.19/case prorated by pack fraction at the case level — it normalizes pack price to €/g via `purchase_quantity=250`.

---

## Full Pipeline Trace (invoice → persistence → detail)

| Stage | Key outputs |
|-------|-------------|
| invoice_item (DB) | qty=4, unit=em, unit_price=2.19, total=8.76 |
| normalizeInvoiceItemFields | qty=4, unit=em |
| parsePurchaseStructureFromText | tier=bare_measure, matchedText=250g, unitSize=250, unitMeasurement=g |
| computeUsableFromPurchaseStructure | usableQuantity=250, usableUnit=g, usableSource=structure_total |
| resolveInvoiceLinePurchaseFormat | kind=weight_or_volume, normalizedUsableQuantity=250, usableQuantityUnit=g |
| isCaseRowWithEmbeddedPieceWeightOnly | **true** (em ∈ PACK_CONTAINER_ROW_UNITS + bare_measure 250g, no explicit case count in name) |
| resolveUsablePerPricedUnit | { amount: 250, unit: "g" } |
| computeEffectiveUsableCost | **{ cost: 2.19, unit: "case" }** — early return, skips €/kg derivation |
| resolveInvoiceLinePricingPresentation | priceDisplay=€2.19 / pack, effectiveUsableCostLabel=**€2.19 / case** |
| operationalCostFieldsFromInvoiceLine (persistence) | { current_price: 2.19, purchase_quantity: 250, cost_base_unit: "g" } |
| recipeOperationalCostFieldsFromInvoiceLine | { current_price: 2.19, purchase_quantity: 250, cost_base_unit: "g" } |
| buildLastPurchaseCostPresentation (detail UI) | procurement=€2.19 / pack, operational=€2.19 / case |

Note: `adjustCasePieceWeightDisplay` (via `resolveStructuredPurchaseForDisplay`) nulls usable quantity for **display-only** case rows; persistence/costing uses `resolveInvoiceLinePurchaseFormat` directly and retains 250 g.

---

## Salada Trace

| Field | Value |
|-------|-------|
| purchase_quantity (persisted) | 250 |
| purchase_unit (catalog) | g |
| usable_quantity | 250 |
| usable_unit | g |
| current_price | €2.19 |
| cost_base_unit | g |
| effective usable cost (display path) | €2.19 / case |
| hypothetical €/kg (without case shortcut) | €8.76 / kg |
| unit_family | weight |
| isCaseRowWithEmbeddedPieceWeightOnly | true |

---

## Similar EMB Products (VL sample, n=2)

| Product | Procurement Display | Operational Display | Usable Quantity |
|---------|----------------------|---------------------|-----------------|
| Manteiga Coimbra s/Sal EMB 1 Kg | €8.90 / kg | €8.90 / kg | 1000 g |
| Salada Ibérica FSTK EMB. 250g | €2.19 / pack | €2.19 / case | 250 g |

**Outlier analysis:** Only 2 EMB/embedded-weight invoice lines on VL. Manteiga Coimbra uses row unit **kg** (true bulk) → operational €/kg aligns with procurement. Salada uses row unit **em** (pack) with embedded 250g → hits `isCaseRowWithEmbeddedPieceWeightOnly` and is the **sole VL product** showing "/ case" operational label. Both persist gram recipe base (purchase_quantity in g).

---

## Relation to Prior Unit Audit

Prior audit (`.tmp/salada-iberica-unit-audit/`) classified as **C — operational-unit derivation** (where "case" originates). This operational-semantics audit refines that: the derivation bug affects **display only**; recipe/persistence cost basis is **correct at €/g**. Revised verdict under the operational-semantics framework: **A — label wrong, cost correct**.

---

## Recipe Usage on VL

No recipe_ingredients rows linked to Salada ibérica on VL.

---

## Bug Classification

| # | Category | Applies? |
|---|----------|:--------:|
| 1 | Wrong label | **Yes** — "case" suffix on operational display |
| 2 | Wrong operational unit | **Partial** — display unit wrong; recipe unit (g) correct |
| 3 | Wrong cost basis | **No** — recipe uses €/g correctly |
| 4 | Expected architecture | **No** — display/recipe divergence is unintended (Angus cx shortcut applied to em packs) |

---

## Evidence Files

- `.tmp/salada-iberica-operational-semantics-audit/results.json`
- Prior audit: `.tmp/salada-iberica-unit-audit/`
- VL ingredient: `47cd8362-79f4-4285-8491-f016229eaa21`
- VL invoice_item: `593e7560-ba2a-4c60-8300-ff34a26335b9`
