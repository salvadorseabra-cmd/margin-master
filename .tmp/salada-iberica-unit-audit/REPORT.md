# Salada Ibérica Unit Representation Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24T00:05:06.368Z

---

## Executive Summary

Salada Ibérica FSTK EMB. 250g (Bidfood, qty **4**, unit **em**, €2.19/pack effective) shows **Procurement €2.19 / pack** and **Operational €2.19 / case** on Ingredient Detail. Invoice data is consistent (4 packs, €8.76 total). The mismatch is **not** data corruption and **not** a UI rendering bug — the detail panel faithfully displays values from `resolveInvoiceLinePricingPresentation`.

**Root cause (classification C):** `isCaseRowWithEmbeddedPieceWeightOnly` returns **true** because row unit `em` is in `PACK_CONTAINER_ROW_UNITS` and the product name embeds bare_measure `250g`. `computeEffectiveUsableCost` then short-circuits to `{ cost: unitPrice, unit: "case" }`, while procurement uses `resolvePriceSuffix` which maps `em` → **pack**.

**FINAL VERDICT: C**

**Why is Salada Ibérica showing €2.19 / case as Operational Cost?**  
Because `computeEffectiveUsableCost` treats EMB (`em`) pack rows with embedded piece weight like case (`cx`) rows and hardcodes operational suffix **case**, bypassing the €/kg derivation that would apply from 250 g usable weight.

---

## Required Table

| Field | Current Value | Source |
|-------|---------------|--------|
| Invoice quantity | 4 | invoice_items.quantity |
| Invoice unit (DB) | em | invoice_items.unit |
| Unit price (effective) | €2.19 | invoice_items.unit_price (post discount binding) |
| Line total | €8.76 | invoice_items.total |
| Last Purchase label | 4 packs | formatRowPurchaseQuantityLabel |
| Procurement Cost | €2.19 / pack | resolveInvoiceLinePricingPresentation.priceDisplay |
| Operational Cost | €2.19 / case | resolveInvoiceLinePricingPresentation.effectiveUsableCostLabel |
| Purchase structure tier | bare_measure | parsePurchaseStructureFromText |
| isCaseRowWithEmbeddedPieceWeightOnly | true | invoice-purchase-format.ts |
| normalizedUsableQuantity | 250 g | resolveInvoiceLinePurchaseFormat |
| ingredients.purchase_unit | g | ingredients table |
| ingredients.current_price | €2.19 | ingredients table |

---

## Q1 — DB State for Ingredient Salada ibérica


| Field | Value |
|-------|-------|
| ingredient_id | `47cd8362-79f4-4285-8491-f016229eaa21` |
| name | Salada ibérica |
| current_price | 2.19 |
| purchase_quantity | 250 |
| purchase_unit | g |
| procurement_unit (derived display) | pack |
| operational_unit (derived display) | case |
| usable_quantity | 250 |
| usable_unit | g |
| purchase_structure_kind | bare_measure |


---

## Q2 — Latest Purchase History


| Field | Value |
|-------|-------|
| invoice_item_id | `593e7560-ba2a-4c60-8300-ff34a26335b9` |
| invoice_id | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| quantity | 4 |
| unit | em |
| unit_price | 2.19 |
| line_total | 8.76 |
| purchase_structure_kind | bare_measure |
| persisted display | **4 packs** (4 packs) |
| supplier | Bidfood Portugal, SA |
| invoice_date | 2026-05-25 |


Purchase was persisted as **pack** (4 packs via `em` → ROW_UNIT_CONTAINER_LABEL pack/plural).

---

## Q3 — Operational Representation Trace

### invoice_item (DB)
```json
{
  "stage": "invoice_item (DB)",
  "quantity": 4,
  "unit": "em",
  "unit_price": 2.19,
  "total": 8.76
}
```

### normalizeInvoiceItemFields
```json
{
  "stage": "normalizeInvoiceItemFields",
  "quantity": 4,
  "unit": "em"
}
```

### parsePurchaseStructureFromText
```json
{
  "stage": "parsePurchaseStructureFromText",
  "tier": "bare_measure",
  "matchedText": "250g",
  "unitSize": 250,
  "unitMeasurement": "g"
}
```

### computeUsableFromPurchaseStructure
```json
{
  "stage": "computeUsableFromPurchaseStructure",
  "usableQuantity": 250,
  "usableUnit": "g",
  "usableSource": "structure_total",
  "purchaseContainerCount": 1
}
```

### resolveInvoiceLinePurchaseFormat
```json
{
  "stage": "resolveInvoiceLinePurchaseFormat",
  "kind": "weight_or_volume",
  "purchaseContainerCount": 1,
  "purchaseContainerUnit": "g",
  "normalizedUsableQuantity": 250,
  "usableQuantityUnit": "g",
  "packageQuantity": 250,
  "packageMeasurementUnit": "g"
}
```

### isCaseRowWithEmbeddedPieceWeightOnly
```json
{
  "stage": "isCaseRowWithEmbeddedPieceWeightOnly",
  "result": true
}
```

### resolveUsablePerPricedUnit
```json
{
  "stage": "resolveUsablePerPricedUnit",
  "perUnit": {
    "amount": 250,
    "unit": "g"
  }
}
```

### computeEffectiveUsableCost
```json
{
  "stage": "computeEffectiveUsableCost",
  "effective": {
    "cost": 2.19,
    "unit": "case"
  }
}
```

### resolveInvoiceLinePricingPresentation
```json
{
  "stage": "resolveInvoiceLinePricingPresentation",
  "priceDisplay": "€2.19 / pack",
  "effectiveUsableCostLabel": "€2.19 / case",
  "usableStockLabel": null,
  "purchaseQuantityLine": "4 packs"
}
```

### buildLastPurchaseCostPresentation (detail UI)
```json
{
  "stage": "buildLastPurchaseCostPresentation (detail UI)",
  "lastPurchase": "4 packs",
  "procurementCost": "€2.19 / pack",
  "operationalCost": "€2.19 / case"
}
```

### operationalCostFieldsFromInvoiceLine (persistence)
```json
{
  "stage": "operationalCostFieldsFromInvoiceLine (persistence)",
  "fields": {
    "current_price": 2.19,
    "purchase_quantity": 250,
    "cost_base_unit": "g"
  }
}
```

### recipeOperationalCostFieldsFromInvoiceLine
```json
{
  "stage": "recipeOperationalCostFieldsFromInvoiceLine",
  "fields": {
    "current_price": 2.19,
    "purchase_quantity": 250,
    "cost_base_unit": "g"
  }
}
```

---

## Q4 — Where Does "case" Originate?

| Option | Description | Applies? |
|--------|-------------|:--------:|
| A | Data corruption | **No** — DB qty=4, unit=em, prices correct |
| B | Purchase-unit mapping | **No** — procurement correctly shows /pack |
| C | Operational-unit derivation | **Yes** — `isCaseRowWithEmbeddedPieceWeightOnly` + `computeEffectiveUsableCost` hardcodes `case` |
| D | UI rendering bug | **No** — `buildLastPurchaseCostPresentation` passes through computed labels |
| E | Mixed | Partial — procurement path correct; only operational derivation wrong |

**Evidence:** `isCaseRowWithEmbeddedPieceWeightOnly("Salada Ibérica FSTK EMB. 250g", "em")` = **true**. When true, `computeEffectiveUsableCost` returns `{"cost":2.19,"unit":"case"}` without kg/L normalization.

Code: `src/lib/invoice-purchase-price-semantics.ts` lines 522–524; `src/lib/invoice-purchase-format.ts` lines 213–224.

---

## Q5 — Control Comparison

| Product | Invoice qty/unit | Last Purchase | Procurement | Operational | isCasePieceWeight | Structure |
|---------|------------------|---------------|-------------|-------------|:-----------------:|-----------|
| **Salada Ibérica** | 4 / em | 4 packs | €2.19 / pack | €2.19 / case | true | bare_measure |
| Ovo classe M | 1 / cx | 1 case | €38.44 / case | null | false | row_only |
| Tomilho | 1 / mo | 1 bunch | €2.06 / bunch | null | false | row_only |
| Manjericão | 5 / mo | 5 bunches | €2.06 / bunch | €20.60 / kg | false | inferred |

Salada differs from herb controls (Tomilho/Manjericão use `mo` bunch suffix, no bare_measure case path) and from Ovo (countable egg path).

---

## Q6 — Consistency Test

| Aspect | Behavior |
|--------|----------|
| Procurement display | resolvePriceSuffix maps row unit em → ROW_UNIT_PRICE_SUFFIX['em'] = 'pack'; priceDisplay = €{unit_price} / pack |
| Operational display | isCaseRowWithEmbeddedPieceWeightOnly triggers computeEffectiveUsableCost early return { cost: unitPrice, unit: 'case' } — skips kg/L derivation |
| Data model implication | Procurement and operational use different code paths: procurement via resolvePriceSuffix (em→pack); operational via isCaseRowWithEmbeddedPieceWeightOnly (em in PACK_CONTAINER_ROW_UNITS + bare_measure → hardcoded 'case') |
| Same € amount, different suffix | **Yes** — €2.19 / pack vs €2.19 / case |

The current data model **does not guarantee** procurement and operational unit suffixes match for EMB pack rows with embedded weight: procurement respects `em`→pack mapping; operational uses the Angus-style case shortcut intended for `cx` rows.

---

## Evidence Files

- `.tmp/salada-iberica-unit-audit/results.json`
- VL invoice_item: `593e7560-ba2a-4c60-8300-ff34a26335b9`
- VL ingredient: `47cd8362-79f4-4285-8491-f016229eaa21`
