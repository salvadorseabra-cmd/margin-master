# Tomilho Procurement → Operational Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24T01:10:01.020Z

---

## Executive Summary

Bidfood line **Tomilho** (invoice `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`, qty **1 mo**, €2.06/bunch) maps to catalog ingredient **Tomilho**. Procurement display is correct (**€2.06 / bunch**, Last Purchase **1 bunch**). **Operational Cost is null / not shown** because `detectConversionHint("Tomilho")` returns null — Tomilho is absent from `PRODUCE_CONVERSION_HINTS` while sibling herb Manjericão matches token `MANJERICAO` → 100 g/bunch → `structured.kind=inferred` → **€20.60 / kg**. Persistence stores `current_price=2.06`, `purchase_quantity=1`, `cost_base_unit=un`, so recipe lines in `un` cost **N × €2.06** (one recipe unit = one priced bunch); recipe lines in `g` return **null** (no usable_weight_grams).

**FINAL VERDICT: C — Missing operational conversion**

**How does Marginly currently intend to cost Tomilho inside recipes?**  
As implemented today: `ingredientLineCostEur(N, { current_price: 2.06, purchase_quantity: 1, cost_base_unit: "un" }, { recipeUnit: "un" })` → **N × €2.06**. The architecture defines a fresh-herb operational path (`detectConversionHint` → 100 g/bunch → €/kg) for tokens including MANJERICAO, HORTELA, COENTROS, SALSA, CEBOLINHO — but **not TOMILHO**. Tomilho therefore stays `row_only` with no operational layer; this is consistent with display rules (suppress when `computeEffectiveUsableCost` is null) but inconsistent with Manjericão on the same invoice class (`mo` bunch herbs).

---

## Required Table: Concept | Current | Intended by Architecture

| Concept | Current | Intended by Architecture |
|---------|---------|--------------------------|
| Purchase Unit | 1 bunch (`mo` → `formatRowPurchaseQuantityLabel`) | bunch — invoice row qty=1 mo |
| Procurement Unit | €2.06 / bunch (`resolvePriceSuffix` mo → bunch) | bunch — `unit_price` is €/bunch on invoice |
| Operational Unit | null / not shown (`effectiveUsableCostLabel` omitted) | kg when fresh-herb `detectConversionHint` applies (100 g/bunch → `computeEffectiveUsableCost`); Tomilho not in `PRODUCE_CONVERSION_HINTS` |
| Recipe Consumption Unit | `un` (persisted `base_unit=un`, `purchase_quantity=1`) | `g` with `purchase_quantity=100` when herb hint applies; `un` with `purchase_quantity=1` when `row_only` and no hint |

---

## Q1 — DB State for "Tomilho"

| Field | Current Value | Source table/column |
|-------|---------------|---------------------|
| ingredient_id | `ac8a9cc3-66cd-4a77-95cb-a3c8104b7041` | `ingredients.id` |
| name | Tomilho | `ingredients.name` |
| current_price | 2.06 | `ingredients.current_price` |
| purchase_quantity | 1 | `ingredients.purchase_quantity` |
| purchase_unit | un | `ingredients.purchase_unit` |
| cost_base_unit | un | `ingredients.base_unit` |
| usable_quantity | null | trace: `resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity` |
| usable_unit | null | trace: `resolveInvoiceLinePurchaseFormat.usableQuantityUnit` |
| purchase_structure_kind | row_only | trace: `structured.kind` |

Confirmed alias: `Tomilho` (Bidfood Portugal). Price history `new_price=2.06` on 2026-05-25 (invoice `da472b7f`).

---

## Q2 — Latest Purchase

| Field | Value |
|-------|-------|
| invoice_item_id | `f2d094ab-f50a-483d-b6cb-76554d5bf195` |
| invoice_id | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| qty | 1 |
| unit | mo |
| unit_price | 2.06 |
| line_total | 2.06 |
| purchase_structure_kind | row_only |
| supplier | Bidfood Portugal, SA |
| invoice_date | 2026-05-25 |

Parsed structure: tier=null, matchedText=null, unitsPerPack=null, conversionHint=null. Persisted as **1 bunch**.

---

## Q3 — Full Trace (Invoice → Recipe Costing)

| Stage | Output |
|-------|--------|
| invoice_item (DB) | qty=1, unit=mo, unit_price=2.06, total=2.06 |
| normalizeInvoiceItemFields | qty=1, unit=mo |
| parsePurchaseStructureFromText | tier=null — no bare_measure, unit_count, or pack token |
| detectConversionHint | **null** — "Tomilho" not in `PRODUCE_CONVERSION_HINTS` tokens |
| computeUsableFromPurchaseStructure | usableQuantity=null, usableUnit=null |
| resolveInvoiceLinePurchaseFormat | kind=**row_only**, normalizedUsableQuantity=null, purchaseContainerUnit=mo |
| resolveUnitsPerPack | null |
| resolveUsablePerPricedUnit | **null** |
| computeEffectiveUsableCost | **null** |
| resolveInvoiceLinePricingPresentation | priceDisplay=**€2.06 / bunch**, effectiveUsableCostLabel=**null** |
| procurementPackFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=1, purchase_unit=un |
| operationalCostFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=1, cost_base_unit=un |
| recipeOperationalCostFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=1, cost_base_unit=un |
| buildLastPurchaseCostPresentation | lastPurchase=1 bunch, procurement=€2.06 / bunch, operational=**null** |
| inferUnitFamily | countable |

Code refs: `invoice-purchase-price-semantics.ts` (`resolveUsablePerPricedUnit`, `computeEffectiveUsableCost`, `recipeOperationalCostFieldsFromInvoiceLine`), `stock-normalization.ts` (`parsePurchaseStructureFromText`), `ingredient-unit-inference.ts` (`detectConversionHint` / `PRODUCE_CONVERSION_HINTS`), `ingredient-detail-panel.ts` (`buildLastPurchaseCostPresentation`).

---

## Q4 — Operational Quantity

**Selected: B — missing**

| Option | Applies? |
|--------|:--------:|
| A present | No — `normalizedUsableQuantity` null; no g/ml per bunch |
| B missing | **Yes** — `resolveUsablePerPricedUnit` null; `detectConversionHint` null for Tomilho |
| C intentionally suppressed | Partial — display suppressed as consequence; quantity itself is absent not hidden |

Evidence: `computeEffectiveUsableCost=null`, `effectiveUsableCostLabel=null`, `conversionHint=null`. Manjericão control on same invoice supplies `estimated_quantity=100`, `stock_unit=g` via `MANJERICAO` token.

---

## Q5 — Recipe Costing (1, 5, 10 units)

**Formula (actual):**  
`effectiveIngredientUnitCostEur = current_price / max(purchase_quantity, 1)`  
`ingredientLineCostEur(qty, fields, { recipeUnit })` via `directCountableLineCostEur` when `recipeUnit=un`

**Source fields (invoice trace = DB persisted):**  
`current_price=2.06`, `purchase_quantity=1`, `cost_base_unit=un`

| Recipe qty | Unit `un` (actual) | Unit `g` (actual) |
|------------|-------------------|-------------------|
| 1 | **€2.06** | null |
| 5 | **€10.30** | null |
| 10 | **€20.60** | null |

Denominator: **1** (one priced bunch per recipe `un`).  
Hypothetical if Manjericão path applied (`purchase_quantity=100`, `cost_base_unit=g`): 1 g → €0.0206, 5 g → €0.103, 10 g → €0.206.

Code refs: `ingredient-unit-cost.ts` `resolvedOperationalUnitCostEur`, `recipe-prep-cost.ts` `ingredientLineCostEur`.

---

## Q6 — Compare: Tomilho, Manjericão, Ovo Classe M, Salada Ibérica

| Ingredient | Procurement | Operational | Recipe Unit | purchase_quantity | Why different? |
|------------|-------------|-------------|-------------|-------------------|----------------|
| **Tomilho** | €2.06 / bunch | null | un | 1 | `row_only`; no conversion hint; countable bunch only |
| **Manjericão** | €2.06 / bunch | €20.60 / kg | g | 100 | `MANJERICAO` in `PRODUCE_CONVERSION_HINTS` → 100 g/bunch inferred |
| **Ovo Classe M** | €38.44 / case | €0.2136 / egg | un | 180 | `multi_unit_pack` — nested dozen structure parsed to 180 eggs |
| **Salada ibérica** | €2.19 / pack | €8.76 / kg | g | 250 | `bare_measure` — 250 g embedded in product name |

Tomilho and Manjericão share invoice unit `mo` and procurement suffix `bunch`; divergence is solely the fresh-herb token table (`ingredient-unit-inference.ts` lines 412–417 lists MANJERICAO, not TOMILHO).

---

## Q7 — Should Operational Cost Display?

**Selected: A, B, C** (display correctly absent under current rules; conversion gap vs Manjericão)

| Option | Applies? |
|--------|:--------:|
| A no usable conversion | **Yes** — `resolveUsablePerPricedUnit` null because `normalizedUsableQuantity` null (`row_only`, no hint) |
| B countable architecture | **Yes** — `inferUnitFamily(mo)` → countable; operational label requires per-unit usable |
| C display suppression | **Yes** — `resolveInvoiceLinePricingPresentation` omits `effectiveUsableCostLabel` when `computeEffectiveUsableCost` returns null |
| D bug | Evidence: Manjericão gets operational via same `mo` row class; Tomilho excluded from hint tokens — asymmetry in conversion coverage, not a render bug |
| E intentionally suppressed by design | No universal rule — architecture provides herb hints for some names only |

Invoice Review observation (**1 bunch, €2.06/bunch, no operational cost**): **Expected under current code** for Tomilho specifically; **not expected** relative to Manjericão sibling herb on the same invoice.

---

## Manjericão vs Tomilho — Direct Comparison

| Aspect | Tomilho | Manjericão |
|--------|---------|------------|
| Invoice unit | mo | mo |
| Procurement | €2.06 / bunch | €2.06 / bunch |
| `detectConversionHint` | null | fresh herbs → 100 g |
| `structured.kind` | row_only | inferred |
| `normalizedUsableQuantity` | null | 100 g |
| Operational display | null | €20.60 / kg |
| Recipe persistence | un, pq=1 | g, pq=100 |
| Token in `PRODUCE_CONVERSION_HINTS` | **absent** | MANJERICAO present |

---

## Evidence Files

- `.tmp/tomilho-audit/results.json`
- `.tmp/tomilho-audit/audit.mts`
- VL ingredient: `ac8a9cc3-66cd-4a77-95cb-a3c8104b7041`
- VL invoice_item: `f2d094ab-f50a-483d-b6cb-76554d5bf195`
- Prior control data: `.tmp/ovo-classe-m-audit/results.json`, `.tmp/salada-iberica-unit-audit/results.json`
