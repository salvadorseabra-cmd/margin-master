# Gorgonzola DOP Dolce — Mathematical Trace Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia, 19 May 2026) · **Read-only** · 2026-06-24

## Required table

| Concept | Value | Source |
|---------|-------|--------|
| Invoice Quantity (DB) | 1.05 | invoice_items.quantity |
| Invoice Unit (DB) | kg | invoice_items.unit |
| Line Total (DB) | 13.44 | invoice_items.total |
| Invoice Unit Price (DB) | 10.88 | invoice_items.unit_price |
| PDF visible Qty (OCR prompt) | 1.35 | invoice-table-extraction.ts Emporio Gorgonzola example; not persisted in invoice_items |
| PDF visible Gross Unit (OCR prompt) | €12.90 | invoice-table-extraction.ts Emporio Gorgonzola example |
| PDF visible Discount % | 22.85% | invoice-table-extraction.ts Emporio Gorgonzola example |
| Purchase Quantity (Last Purchase label) | 1.05 kg | formatRowPurchaseQuantityLabel(metadata) |
| Usable Quantity (pack from name) | 1500 | parsePurchaseStructureFromText → g |
| Current Price (persisted) | 10.88 | ingredients.current_price |
| Cost Base Unit (persisted) | g | ingredients.base_unit |
| Purchase Quantity (persisted denominator) | 1000 | ingredients.purchase_quantity |
| Procurement Cost | €10.88 / kg | resolveInvoiceLinePricingPresentation.priceDisplay |
| Operational Cost | €10.88 / kg | computeEffectiveUsableCost → resolveInvoiceLinePricingPresentation |
| Recipe Denominator | 1000g | recipeOperationalCostFieldsFromInvoiceLine |
| Total Paid (detail) | €13.44 | invoice_items.total → buildLastPurchaseCostPresentation |
| 13.44 ÷ X = 10.88 → X | 1.2353 | algebraic solve; X = 1.2353 kg implied if €10.88 were effective-paid €/kg |
| 13.44 ÷ 1.05 kg (user expectation) | 12.8000 | line_total / invoice_items.quantity |

## Task 1 — Raw invoice trace

| Field | Value |
|-------|-------|
| invoice_id | ab52796d-de1d-418d-86e7-230c8f056f09 |
| invoice_item_id | bece238e-fd6d-493c-8555-6921b164f97c |
| raw_description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg |
| raw_quantity | 1.05 |
| raw_unit | kg |
| unit_price | 10.88 |
| line_total | 13.44 |
| created_at | 2026-06-23T10:41:31.22202+00:00 |
| updated_at | 2026-06-23T10:41:31.22202+00:00 |
| note | invoice_items schema has no gross_unit_price/discount_pct columns; OCR structured fields replayed via bindMonetaryColumns only |

### OCR / extraction replays (not stored in DB)

**PDF_visible_Emporio_prompt_example** → bound: `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.35,"unit":"kg","gross_unit_price":12.9,"discount_pct":22.85,"line_total_net":13.44,"unit_price":9.95,"total":13.44}`
**live_db_values_as_bound_input** → bound: `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","gross_unit_price":null,"discount_pct":null,"line_total_net":13.44,"unit_price":10.88,"total":13.44}`
**structured_gross_discount_with_db_qty_1_05** → bound: `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","gross_unit_price":12.9,"discount_pct":22.85,"line_total_net":13.44,"unit_price":9.95,"total":13.44}`
**emporio_footer_fix_extract** → bound: `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrottto 1/8 - 1,5kg","quantity":1.35,"unit":"kg","gross_unit_price":null,"discount_pct":null,"line_total_net":null,"unit_price":9.92,"total":13.44}`

**Prior audit verification:** emporio-deli-family-audit claimed qty=1.05, unit_price=10.88, total=13.44 → live DB matches: **YES**

User-reported Invoice UI values (Qty 1.35, Unit €12.90) match the **PDF/OCR prompt example** in `invoice-table-extraction.ts`, not `invoice_items` persisted columns.

## Task 2 — parsePurchaseStructureFromText trace

```json
{
  "purchaseQuantity": 1,
  "purchaseFormat": "unit",
  "unitSize": 1.5,
  "unitMeasurement": "kg",
  "totalUsableAmount": 1500,
  "usableUnit": "g",
  "matchedText": "1,5kg",
  "tier": "bare_measure"
}
```

**usableChain:** `{"purchaseContainerCount":1,"usableQuantity":1500,"usableUnit":"g","unitFamily":"mass","usableSource":"structure_total","fallbackReason":null,"weak_scalar_activated":false}`
**structured kind:** weight_or_volume, normalized=1500g

## Task 3 — Persistence trace

| Stage | Value |
|-------|-------|
| operationalCostFieldsFromInvoiceLine | {"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"} |
| recipeOperationalCostFieldsFromInvoiceLine | {"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"} |
| ingredients (stored) | {"id":"1526106c-7bac-4b70-bd51-7b0fd5cc89ed","name":"Gorgonzola DOP dolce","current_price":10.88,"purchase_quantity":1000,"purchase_unit":"g","base_unit":"g","unit":"g","normalized_name":"gorgonzola dop dolce","supplier":null,"created_at":"2026-06-15T17:49:59.870301+00:00","updated_at":"2026-06-23T10:41:32.81021+00:00"} |
| catalog matches recipe fields | true |

## Task 4 — Procurement €10.88/kg reconstruction

| Step | Value |
|------|-------|
| numerator (unit_price) | 10.88 |
| operational denominator | 1000 g |
| formula | unit_price ÷ (1000g ÷ 1000) = 10.88 €/kg |
| **13.44 ÷ X = 10.88 → X** | **1.2353 kg** (not 1.05 kg) |
| 13.44 ÷ 1.05 kg | 12.8000 €/kg (effective-paid; not used for €/kg display) |
| qty × unit_price | 11.4240 ≠ 13.44 |

€10.88/kg is **not** derived from line_total ÷ purchased kg. It is **invoice_items.unit_price** passed through the kg-row short-circuit with a **1000 g** priced-unit denominator.

## Task 5 — Operational cost reconstruction

- **resolveInvoiceLinePricingPresentation:** procurement=`€10.88 / kg`, operational=`€10.88 / kg`
- **computeEffectiveUsableCost:** `{"cost":10.88,"unit":"kg"}`
- **buildLastPurchaseCostPresentation:** `{"lastPurchase":"1.05 kg","procurementCost":"€10.88 / kg","operationalCost":"€10.88 / kg","totalPaid":"€13.44","supplier":null,"purchaseDate":null,"lines":[{"label":"Last Purchase","value":"1.05 kg"},{"label":"Procurement Cost","value":"€10.88 / kg"},{"label":"Operational Cost","value":"€10.88 / kg"},{"label":"Total Paid","value":"€13.44"}]}`

## Task 6 — Ingredient detail reconciliation

| Measure | Value | Basis |
|---------|-------|-------|
| Last Purchase | 1.05 kg | invoice row quantity (1.05 kg) |
| Procurement €/kg | €10.88/kg | unit_price with 1000g denominator |
| Effective paid €/kg | €12.80/kg | line_total ÷ qty |

**T6 classification: B) Different denominator** — Last Purchase shows weighed row qty (1.05 kg); €/kg uses `unit_price` with operational denominator **1000 g**, not purchased kg.

**Arithmetic note:** 1.05 × €10.88 = €11.42 ≠ €13.44 total. Effective-paid rate is €13.44 ÷ 1.05 = **€12.80/kg**. Persisted `unit_price` €10.88 is neither effective-paid nor reproducible from PDF binding (12.90 gross × 22.85% disc → €9.95/kg).

## Task 7 — Recipe costing

| Quantity | Cost (€) |
|----------|----------|
| 100 g | 1.0880 |
| 250 g | 2.7200 |
| 500 g | 5.4400 |
| 1000 g | 10.8800 |

**Recipe denominator matches operational denominator:** YES
Formula: cost = (current_price / purchase_quantity) × grams = (10.88 / 1000) × g

## Task 8 — ingredient_price_history

| created_at | new_price (€/g) | €/kg equivalent | invoice_id |
|------------|-----------------|-----------------|------------|
| 2026-05-19T12:00:00+00:00 | 0.01088 | €10.88/kg | ab52796d-de1d-418d-86e7-230c8f056f09 |

**Historical vs current denominator:** same 1000g basis (history new_price 0.01088 €/g = current_price 10.88 / purchase_quantity 1000).

## Final verdict

**B)** Display inconsistency only

**Why does Marginly show €10.88/kg and what exact quantity is the denominator?**

Marginly shows €10.88/kg because invoice_items.unit_price (10.88) is treated as net €/kg for kg-priced rows; operational/recipe denominator is fixed 1000g per recipeOperationalCostFieldsFromInvoiceLine / resolveUsablePerPricedUnit — NOT purchased weight 1.05 kg and NOT line_total÷qty (€12.80/kg).

- **Denominator quantity:** 1000 g (1 priced kg)
- **Denominator source:** resolveUsablePerPricedUnit L489-491: row unit kg → { amount: 1000, unit: g }

Last Purchase **1.05 kg** is the weighed invoice quantity (`formatRowPurchaseQuantityLabel`). €/kg **10.88** is `invoice_items.unit_price` (net list €/kg), not `line_total ÷ 1.05` (€12.80/kg). The architecture treats kg invoice rows as €/kg priced per **1000 g**, independent of actual purchased weight.