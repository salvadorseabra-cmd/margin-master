# Ovo Classe M Procurement → Operational Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24T00:26:56.958Z

---

## Executive Summary

Bidfood line **Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)** (invoice `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`, qty **1 cx**, €38.44/case) maps to catalog ingredient **Ovo classe M**. Procurement display is correct (**€38.44 / case**, Last Purchase **1 case**). **Operational Cost is null / not shown** because `computeEffectiveUsableCost` returns null — the name embeds `Cx.15 dúzias` but `parsePurchaseStructureFromText` yields no structure (`structured.kind = row_only`), so `resolveUsablePerPricedUnit` has no usable denominator. Persistence stores `current_price=38.44`, `purchase_quantity=1`, `cost_base_unit=un`, making recipe `un` lines cost **N × €38.44** (whole case per recipe unit), not per egg.

**FINAL VERDICT: C — Missing operational conversion**

**How does Marginly intend to cost 1 egg in a recipe when purchase is 1 case of 15 dozen eggs for €38.44?**  
As implemented today: `ingredientLineCostEur(N, { current_price: 38.44, purchase_quantity: 1, cost_base_unit: "un" }, { recipeUnit: "un" })` → **N × €38.44**. The codebase defines an egg noun via `inferCountableCostUnit` → `"egg"` and a per-egg display path via `computeEffectiveUsableCost` → `unitPrice / operationalUsable.amount`, but that path requires a parsed usable count. With `row_only` and no dozen extraction, neither operational display nor per-egg recipe denominator is populated. A mathematically consistent per-egg model would require `purchase_quantity = 180` (15 × 12); that value is not produced by the current pipeline.

---

## Required Table: Concept | Current | Intended by Architecture

| Concept | Current | Intended by Architecture |
|---------|---------|--------------------------|
| Purchase Unit | 1 case (`cx` → `formatRowPurchaseQuantityLabel`) | case — invoice priced container |
| Procurement Unit | €38.44 / case (`resolvePriceSuffix` cx → case) | case — matches invoice unit_price semantics |
| Operational Unit | null / not shown (`effectiveUsableCostLabel` omitted) | egg — `inferCountableCostUnit` → `"egg"` when `resolveUsablePerPricedUnit` yields countable amount (requires parsing nested 15×dozen → 180 eggs) |
| Recipe Consumption Unit | `un` (persisted `base_unit=un`, `purchase_quantity=1`) | `un` per egg with denominator = total eggs per case (180), not 1 |

---

## Q1 — DB State for "Ovo classe M"

| Field | Current Value | Source |
|-------|---------------|--------|
| ingredient_id | `9f167402-9ea8-4fac-92dc-2cb11a525359` | `ingredients.id` |
| name | Ovo classe M | `ingredients.name` |
| current_price | 38.44 | `ingredients.current_price` |
| purchase_quantity | 1 | `ingredients.purchase_quantity` |
| purchase_unit | un | `ingredients.purchase_unit` |
| cost_base_unit | un | `ingredients.base_unit` |
| usable_quantity | null | trace: `resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity` |
| usable_unit | null | trace: `resolveInvoiceLinePurchaseFormat.usableQuantityUnit` |
| purchase_structure_kind | row_only | trace: `structured.kind` (no `parsePurchaseStructureFromText` tier) |

Confirmed alias: `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` (Bidfood Portugal). Price history `new_price=38.44` on 2026-05-25.

---

## Q2 — Latest Purchase History

| Field | Value |
|-------|-------|
| invoice_item_id | `480e66ee-dbee-4e2a-ac78-dc13a0f9fd63` |
| invoice_id | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| qty | 1 |
| unit | cx |
| unit_price | 38.44 |
| total | 38.44 |
| purchase_structure_kind | row_only |
| parsed structure | tier=null, matchedText=null, unitsPerPack=null |
| supplier | Bidfood Portugal, SA |
| invoice_date | 2026-05-25 |

**Persisted as case/dozen/egg/other?**  
**Case** at purchase/procurement layer (`1 case`, €/case). **Neither dozen nor egg** — `Cx.15 dúzias` is not parsed; no dozen or egg counts enter normalization or persistence.

---

## Q3 — Full Trace (OCR → normalization → purchase structure → procurement → operational → recipe costing)

| Stage | Output |
|-------|--------|
| invoice_item (DB) | qty=1, unit=cx, unit_price=38.44, total=38.44 |
| normalizeInvoiceItemFields | qty=1, unit=cx |
| parsePurchaseStructureFromText | tier=null — no bare_measure, unit_count, or dozen token matched |
| computeUsableFromPurchaseStructure | usableQuantity=null, usableUnit=null |
| resolveInvoiceLinePurchaseFormat | kind=**row_only**, normalizedUsableQuantity=null, purchaseContainerUnit=cx, purchaseContainerCount=1 |
| resolveUnitsPerPack | null |
| resolveUsablePerPricedUnit | **null** (no normalizedUsableQuantity) |
| computeEffectiveUsableCost | **null** |
| resolveInvoiceLinePricingPresentation | priceDisplay=**€38.44 / case**, effectiveUsableCostLabel=**null** |
| procurementPackFieldsFromInvoiceLine | current_price=38.44, purchase_quantity=1, purchase_unit=un |
| operationalCostFieldsFromInvoiceLine | current_price=38.44, purchase_quantity=1, cost_base_unit=un |
| recipeOperationalCostFieldsFromInvoiceLine | current_price=38.44, purchase_quantity=1, cost_base_unit=un |
| buildLastPurchaseCostPresentation | lastPurchase=1 case, procurement=€38.44 / case, operational=**null** |
| inferUnitFamily | countable |

**Unit transformations:** cx (invoice) → case (display label) → un (persisted base with qty=1). No transformation to dozen (15) or egg (180). `isCaseRowWithEmbeddedPieceWeightOnly` = **false** (not weight-family EMB path).

---

## Q4 — Intended Operational Unit

**Selected: D — unclear (with code pointing to C egg when conversion exists)**

| Option | Evidence |
|--------|----------|
| A case | Procurement and Last Purchase use case; `resolvePriceSuffix` maps cx → case |
| B dozen | No dozen/`dúzia` parser in `stock-normalization.ts` or `invoice-purchase-format.ts` |
| C egg | `inferCountableCostUnit` / `inferProductUnitNoun` map ovo → egg/eggs in `invoice-purchase-price-semantics.ts` lines 391–407; reachable only when `computeEffectiveUsableCost` countable branch runs |
| D unclear | Nested **15 dúzias** not extracted; architecture documents egg costing intent in code but pipeline never supplies usable egg count |

---

## Q5 — Recipe Costing (1, 2, 6, 12 eggs)

**Formula (actual):**  
`effectiveIngredientUnitCostEur = current_price / max(purchase_quantity, 1)`  
`ingredientLineCostEur(qty, fields, { recipeUnit: "un" })` → `qty × (38.44 / 1)` via `directCountableLineCostEur`

**Source fields (invoice trace = DB persisted):**  
`current_price=38.44`, `purchase_quantity=1`, `cost_base_unit=un`

| Eggs (recipe qty, unit=un) | Line cost (actual pipeline) | Per-egg if denominator were 180 |
|----------------------------|----------------------------|-----------------------------------|
| 1 | **€38.44** | €0.2136 |
| 2 | **€76.88** | €0.4271 |
| 6 | **€230.64** | €1.2813 |
| 12 | **€461.28** | €2.5627 |

Recipe lines in `g` return **null** (no `usable_weight_grams` on persisted fields).  
Code refs: `recipe-prep-cost.ts` `ingredientLineCostEur`, `ingredient-unit-cost.ts` `resolvedOperationalUnitCostEur`, `invoice-purchase-price-semantics.ts` `recipeOperationalCostFieldsFromInvoiceLine` / `resolveCountablePurchaseQuantityForCost`.

---

## Q6 — Compare: Ovo, Tomilho, Manjericão, Salada ibérica

| Ingredient | Procurement | Operational | Recipe Unit | purchase_quantity |
|------------|-------------|-------------|-------------|-------------------|
| **Ovo classe M** | €38.44 / case | null | un | 1 |
| **Tomilho** | €2.06 / bunch | null | un | 1 |
| **Manjericão** | €2.06 / bunch | €20.60 / kg | g | 100 |
| **Salada ibérica** | €2.19 / pack | €8.76 / kg | g | 250 |

Ovo aligns with Tomilho (countable bunch/herb row, operational suppressed). Manjericão and Salada derive operational €/kg from parsed usable grams (100 g, 250 g). Ovo lacks parsed usable count despite embedded pack notation in the name.

---

## Q7 — Should Operational Cost Display?

**If not, why:** **A — no usable conversion** (primary)

| Option | Applies? |
|--------|:--------:|
| A no usable conversion | **Yes** — `resolveUsablePerPricedUnit` null because `normalizedUsableQuantity` null (`row_only`) |
| B countable architecture | Partial — `inferUnitFamily(cx)` → countable; architecture expects per-unit usable for operational label |
| C display suppression | Yes — mechanism: `resolveInvoiceLinePricingPresentation` omits `effectiveUsableCostLabel` when `computeEffectiveUsableCost` returns null |
| D bug | No — suppression is consistent with null conversion; missing dozen parse is a conversion gap, not a mis-render of a computed value |

Operational Cost **should not display** under current rules when no usable per-unit amount exists. Ingredient Detail shows procurement only (`buildLastPurchaseCostPresentation`: operationalCost=null).

---

## Salada Audit Pattern Comparison

| Aspect | Salada ibérica | Ovo classe M |
|--------|----------------|--------------|
| Embedded notation | 250g (bare_measure) | Cx.15 dúzias (unparsed) |
| structured.kind | weight_or_volume | row_only |
| Operational display | €8.76 / kg (current code trace) | null |
| Recipe persistence | g, purchase_quantity=250 | un, purchase_quantity=1 |
| Root issue class | Display/recipe split (prior audits) | Missing nested-count conversion entirely |

---

## Evidence Files

- `.tmp/ovo-classe-m-audit/results.json`
- `.tmp/ovo-classe-m-audit/audit.mts`
- VL ingredient: `9f167402-9ea8-4fac-92dc-2cb11a525359`
- VL invoice_item: `480e66ee-dbee-4e2a-ac78-dc13a0f9fd63`
- Prior control data: `.tmp/salada-iberica-unit-audit/results.json` (Ovo row)
