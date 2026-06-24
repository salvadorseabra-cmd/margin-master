# Manjericão Procurement → Operational Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24T01:32:08.142Z

---

## Executive Summary

Bidfood line **Manjericão** (invoice `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`, qty **5 mo**, €2.06/bunch, line total €10.28) maps to catalog ingredient **Manjericão** (`8fe3ab95-b508-48b5-9890-d737dee78cc6`). Procurement display is **€2.06 / bunch**, Last Purchase **5 bunches**. Operational Cost is **€20.60 / kg** via `detectConversionHint("Manjericão")` → token `MANJERICAO` in `PRODUCE_CONVERSION_HINTS` (fresh herbs group, 100 g/bunch) → `structured.kind=inferred` → `resolveUsablePerPricedUnit` = 100 g → `computeEffectiveUsableCost` = €2.06 ÷ 0.1 kg. Persistence stores `current_price=2.06`, `purchase_quantity=100`, `cost_base_unit=g`, matching the invoice trace. Recipe lines in `g` cost **qty × (€2.06 / 100)**.

**FINAL VERDICT: A — Correct**

**Can Marginly safely use Manjericão for recipe costing today?**  
**Yes.** The 100 g/bunch conversion is applied per architecture; operational €/kg, recipe denominator, and DB persisted fields are aligned end-to-end.

---

## Required Table: Concept | Current | Intended by Architecture

| Concept | Current | Intended by Architecture |
|---------|---------|--------------------------|
| Purchase Unit | 5 bunches (`mo` → `formatRowPurchaseQuantityLabel`) | bunch — invoice row qty=5 mo |
| Procurement Unit | €2.06 / bunch (`resolvePriceSuffix` mo → bunch) | bunch — `unit_price` is €/bunch on invoice |
| Operational Unit | €20.60 / kg (`computeEffectiveUsableCost`) | kg — `detectConversionHint` MANJERICAO → 100 g/bunch → €/kg |
| Recipe Consumption Unit | `g` (persisted `base_unit=g`, `purchase_quantity=100`) | `g` with `purchase_quantity=100` (grams per priced bunch); `current_price`=€/bunch |
| Conversion Hint | 100 g/bunch (runtime via `detectConversionHint`) | `PRODUCE_CONVERSION_HINTS` fresh herbs `MANJERICAO` → 100 g usable per bunch; hint table not persisted as separate field |

---

## Q1 — DB State for Manjericão

| Field | Current Value | Source |
|-------|---------------|--------|
| ingredient_id | `8fe3ab95-b508-48b5-9890-d737dee78cc6` | `ingredients.id` |
| name | Manjericão | `ingredients.name` |
| current_price | 2.06 | `ingredients.current_price` (€/bunch) |
| purchase_quantity | 100 | `ingredients.purchase_quantity` (grams per bunch — recipe denominator) |
| purchase_unit | g | `ingredients.purchase_unit` |
| cost_base_unit | g | `ingredients.base_unit` |
| usable_quantity | 500 | trace: `resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity` (5 × 100 g) |
| usable_unit | g | trace: `resolveInvoiceLinePurchaseFormat.usableQuantityUnit` |
| purchase_structure_kind | inferred | trace: `structured.kind` via `conversion_hint` |

Confirmed alias: `Manjericão` (Bidfood Portugal). Match status: `confirmed`, `confirmed-alias`. Price history `new_price=0.0206` on 2026-05-25 (€/g unit cost = €2.06/100 g).

---

## Q2 — Latest Purchase — invoice_item Details & Persistence

| Field | Value |
|-------|-------|
| invoice_item_id | `b47828a9-e042-4437-b0b7-8944c812509a` |
| invoice_id | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| qty | 5 |
| unit | mo |
| unit_price | 2.06 |
| line_total | 10.28 |
| purchase_structure_kind | inferred |
| supplier | Bidfood Portugal, SA |
| invoice_date | 2026-05-25 |

**How persisted:** `operationalCostFieldsFromInvoiceLine` → `recipeOperationalCostFieldsFromInvoiceLine` yields `{ current_price: 2.06, purchase_quantity: 100, cost_base_unit: "g" }`. These fields are written to `ingredients` on match confirm. Display label **5 bunches** from `formatRowPurchaseQuantityLabel`. The raw `conversion_hint` object is runtime-only; derived operational fields (100 g denominator) are persisted.

---

## Q3 — Full Trace (Invoice → Recipe Costing)

| Stage | Output |
|-------|--------|
| invoice_item (DB) | qty=5, unit=mo, unit_price=2.06, total=10.28 |
| normalizeInvoiceItemFields | qty=5, unit=mo |
| parsePurchaseStructureFromText | tier=null — no embedded weight/pack phrase in name |
| detectConversionHint | **MANJERICAO** → 100 g usable, label=fresh herbs, confidence=0.58 |
| computeUsableFromPurchaseStructure | null (no purchase structure; inference path used downstream) |
| resolveInvoiceLinePurchaseFormat | kind=**inferred**, normalizedUsableQuantity=**500**, usableQuantityUnit=g, purchaseContainerCount=5, `inferred.conversion_hint` populated |
| resolveUnitsPerPack | null |
| resolveUsablePerPricedUnit | **{ amount: 100, unit: "g" }** (per-bunch, not row total) |
| computeEffectiveUsableCost | **{ cost: 20.60, unit: "kg" }** |
| resolveInvoiceLinePricingPresentation | priceDisplay=**€2.06 / bunch**, effectiveUsableCostLabel=**€20.60 / kg** |
| procurementPackFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=100, purchase_unit=g, base_unit=g |
| operationalCostFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=100, cost_base_unit=g |
| recipeOperationalCostFieldsFromInvoiceLine | current_price=2.06, purchase_quantity=100, cost_base_unit=g |
| buildLastPurchaseCostPresentation | lastPurchase=5 bunches, procurement=€2.06 / bunch, operational=€20.60 / kg |
| inferUnitFamily | **weight** (not countable — conversion hint drives weight family) |

Code refs: `ingredient-unit-inference.ts` (`PRODUCE_CONVERSION_HINTS`, `detectConversionHint`), `invoice-purchase-format.ts` (`resolveInvoiceLinePurchaseFormat` → `kind=inferred`), `invoice-purchase-price-semantics.ts` (`resolveUsablePerPricedUnit`, `computeEffectiveUsableCost`, `recipeOperationalCostFieldsFromInvoiceLine`), `stock-normalization.ts` (`parsePurchaseStructureFromText`), `ingredient-auto-persist.ts` (`operationalCostFieldsFromInvoiceLine`), `ingredient-detail-panel.ts` (`buildLastPurchaseCostPresentation`).

---

## Q4 — Conversion Hint Audit for MANJERICAO

| Aspect | Evidence |
|--------|----------|
| **Where defined** | `src/lib/ingredient-unit-inference.ts` lines 412–417 — `PRODUCE_CONVERSION_HINTS` fresh herbs group, token `MANJERICAO`, `estimatedQuantity: 100`, confidence 0.58 |
| **Where applied** | `detectConversionHint(name)` → `inferPurchaseUnitsFromLineItemName` → `conversion_hint` on `UnitInferenceResult` → `resolveInvoiceLinePurchaseFormat` (`kind=inferred`) → `resolveUsablePerPricedUnit` (100 g/bunch) → `computeEffectiveUsableCost` (€/kg) → `recipeOperationalCostFieldsFromInvoiceLine` (`purchase_quantity=100`, `cost_base_unit=g`) |
| **Persisted or runtime** | Hint object: **runtime only** (comment at line 426–429: schema has no separate estimated-yield field). Derived fields `purchase_quantity=100`, `cost_base_unit=g`, `current_price=2.06`: **persisted** to `ingredients` |
| **Tests** | `invoice-purchase-price-semantics.test.ts`: `formatRowPurchaseQuantityLabel({ name: "Manjericão", quantity: 2, unit: "mo" })` → `"2 bunches"`. `.tmp/fresh-produce-conversion-audit/results.json`: MANJERICAO in hint table, 100 g path verified. No dedicated test asserting full Manjericão €/kg operational chain |

---

## Q5 — Recipe Costing (10 g, 25 g, 50 g, 100 g)

**Formula:** `resolvedOperationalUnitCostEur = current_price / purchase_quantity` → `ingredientLineCostEur(qty, fields, { recipeUnit: "g" }) = qty × unitCost`

**Fields (invoice trace = DB persisted):** `{ current_price: 2.06, purchase_quantity: 100, cost_base_unit: "g" }`  
**Unit cost:** €0.0206 / g

| Recipe qty | Calculation | Line cost |
|------------|-------------|-----------|
| 10 g | 10 × (2.06 / 100) | **€0.206** |
| 25 g | 25 × (2.06 / 100) | **€0.515** |
| 50 g | 50 × (2.06 / 100) | **€1.03** |
| 100 g | 100 × (2.06 / 100) | **€2.06** (= 1 bunch procurement price) |

Invoice trace and DB persisted fields produce identical results for all four scenarios.

---

## Q6 — Compare: Manjericão, Tomilho, Salada, Ovo

| Ingredient | Procurement | Operational | Recipe unit | purchase_quantity | Conversion path | structured.kind |
|------------|-------------|-------------|-------------|-------------------|-----------------|-----------------|
| **Manjericão** | €2.06 / bunch | **€20.60 / kg** | g | 100 | `MANJERICAO` in `PRODUCE_CONVERSION_HINTS` → 100 g/bunch inferred | inferred |
| **Tomilho** | €2.06 / bunch | null | un | 1 | No hint — `TOMILHO` absent from hint table | row_only |
| **Salada ibérica** | €2.19 / pack | €8.76 / kg | g | 250 | Embedded `250g` in name → `bare_measure` structure (not hint table) | weight_or_volume |
| **Ovo Classe M** | €38.44 / case | €0.2136 / egg | un | 180 | `Cx.15 dúzias` name structure → 180 eggs/case | multi_unit_pack |

**Why they differ:** Manjericão uses the **name-token conversion hint** path (estimated yield, no embedded weight in name). Tomilho shares invoice class (`mo` bunch) but lacks the token. Salada derives grams from **embedded product text** (`250g`). Ovo derives count from **pack phrase structure** (dozen multiplier chain).

---

## Q7 — Consistency: 5 bunches × €2.06, 100 g/bunch → €20.60/kg

| Check | Result |
|-------|--------|
| Math: €2.06/bunch ÷ 0.1 kg/bunch | **€20.60/kg** ✓ |
| Displayed operational | **€20.60 / kg** ✓ |
| Total usable: 5 × 100 g | **500 g** (= `normalizedUsableQuantity`) ✓ |
| Recipe denominator | **purchase_quantity=100**, **cost_base_unit=g** ✓ |
| DB vs trace alignment | **Match** ✓ |
| Recipe scenarios aligned | **Yes** ✓ |

**Answer: YES**

---

## FINAL VERDICT

**A — Correct:** 100 g/bunch conversion, €20.60/kg operational, recipe g-costing aligned end-to-end.

| Option | Description |
|--------|-------------|
| **A** ✓ | Correct — architecture path fully satisfied |
| B | Display correct but recipe misaligned |
| C | Conversion hint runtime-only gap |
| D | Math error |
| E | Unsafe for recipe costing |

**Can Marginly safely use Manjericão for recipe costing today?** Yes.

---

## Evidence Files

- `.tmp/manjericao-audit/results.json` — machine-readable audit output
- `.tmp/manjericao-audit/audit.mts` — replay script (read-only VL queries + pipeline trace)
- Cross-reference: `.tmp/fresh-produce-conversion-audit/`, `.tmp/tomilho-audit/`
