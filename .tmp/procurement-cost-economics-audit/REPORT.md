# Procurement Cost Economics Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia) · **Read-only** · 2026-06-24

## Goal

Does **Procurement Cost** represent **A) Invoice Unit Price** or **B) Effective Cost Paid** (line_total ÷ qty)?

## Required table

| Product | Unit Price | Effective Paid Cost | Displayed Procurement | Match? |
|---------|------------|---------------------|----------------------|--------|
| Gorgonzola DOP dolce | €10.88/kg | €12.80/kg | €10.88 / kg | UNIT_PRICE |
| Prosciutto cotto scelto | €8.50/kg | €8.50/kg | €8.50 / kg | BOTH |
| Mortadella IGP massima con pistacchio | €9.99/kg | €9.99/kg | €9.99 / kg | BOTH |
| Bresaola punta d'anca oro | €27.04/kg | €27.04/kg | €27.04 / kg | BOTH |

## Task 1 — Gorgonzola full trace

### Raw invoice (DB)

| Field | Value | Source |
|-------|-------|--------|
| Last Purchase qty | 1.05 kg | formatRowPurchaseQuantityLabel(metadata) → invoice_items.quantity+unit |
| Procurement Cost | €10.88 / kg | resolvePurchaseCostLabels → presentation.priceDisplay → unit_price |
| Operational Cost | €10.88 / kg | computeEffectiveUsableCost(unit_price) |
| Total Paid | €13.44 | invoice_items.total |
| current_price | 10.88 | ingredients.current_price ← operationalCostFieldsFromInvoiceLine |
| purchase_quantity | 1000 | recipeOperationalCostFieldsFromInvoiceLine kg short-circuit → 1000g |

### Invoice item columns

```json
{
  "invoice_id": "ab52796d-de1d-418d-86e7-230c8f056f09",
  "invoice_item_id": "bece238e-fd6d-493c-8555-6921b164f97c",
  "raw_description": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  "raw_quantity": 1.05,
  "raw_unit": "kg",
  "unit_price": 10.88,
  "line_total": 13.44,
  "created_at": "2026-06-23T10:41:31.22202+00:00",
  "updated_at": "2026-06-23T10:41:31.22202+00:00"
}
```

### bindMonetaryColumns replays

- **live_db_as_bound_input** → `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","gross_unit_price":null,"discount_pct":null,"line_total_net":13.44,"unit_price":10.88,"total":13.44}`
- **pdf_gross_discount_qty_1_35** → `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.35,"unit":"kg","gross_unit_price":12.9,"discount_pct":22.85,"line_total_net":13.44,"unit_price":9.95,"total":13.44}`
- **pdf_gross_discount_db_qty_1_05** → `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","gross_unit_price":12.9,"discount_pct":22.85,"line_total_net":13.44,"unit_price":9.95,"total":13.44}`
- **effective_paid_rebind_candidate** → `{"name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","gross_unit_price":null,"discount_pct":null,"line_total_net":null,"unit_price":10.88,"total":13.44}`

### Persistence chain

| Function | Output |
|----------|--------|
| operationalCostFieldsFromInvoiceLine | `{"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"}` |
| recipeOperationalCostFieldsFromInvoiceLine | `{"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"}` |
| resolveUsablePerPricedUnit | `{"amount":1000,"unit":"g"}` |
| computeEffectiveUsableCost | `{"cost":10.88,"unit":"kg"}` |
| buildLastPurchaseCostPresentation | `{"lastPurchase":"1.05 kg","procurementCost":"€10.88 / kg","operationalCost":"€10.88 / kg","totalPaid":"€13.44","supplier":"Emporio Italia","purchaseDate":"19/05/2026","lines":[{"label":"Last Purchase","value":"1.05 kg"},{"label":"Procurement Cost","value":"€10.88 / kg"},{"label":"Operational Cost","value":"€10.88 / kg"},{"label":"Total Paid","value":"€13.44"},{"label":"Supplier","value":"Emporio Italia"},{"label":"Purchase Date","value":"19/05/2026"}]}` |

## Task 2 — Procurement Cost origin

### resolvePurchaseCostLabels

- **Source:** `src/lib/ingredient-purchase-memory.ts L94-103`
- **procurementCostLabel** = `presentation.priceDisplay`
- **Classification:** **A)** Procurement Cost label = Invoice Unit Price (not line_total÷qty)

### buildLastPurchaseCostPresentation

- **Source:** `src/lib/ingredient-detail-panel.ts L299-334`
- **procurementCost** = `purchase.procurementCostLabel (passthrough from resolvePurchaseCostLabels)`
- **Classification:** **A)** Invoice Unit Price passthrough

## Task 3 — Effective cost paid vs displayed

| Product | unit_price | effective paid €/kg | displayed procurement | matches unit_price? | matches effective? | qty×unit=total? |
|---------|------------|---------------------|----------------------|---------------------|-------------------|----------------|
| Gorgonzola DOP dolce | 10.88 | 12.8000 | €10.88 / kg | true | false | false |
| Prosciutto cotto scelto | 8.5 | 8.4977 | €8.50 / kg | true | true | true |
| Mortadella IGP massima con pistacchio | 9.99 | 9.9904 | €9.99 / kg | true | true | true |
| Bresaola punta d'anca oro | 27.04 | 27.0383 | €27.04 / kg | true | true | true |

## Task 4 — Deli family: unit_price == line_total÷qty?

| Product | qty | unit_price | total | total÷qty | equal? | qty×unit |
|---------|-----|------------|-------|----------|--------|---------|
| Gorgonzola DOP dolce | 1.05 | 10.88 | 13.44 | 12.8000 | false | 11.4240 |
| Prosciutto cotto scelto | 4.3 | 8.5 | 36.54 | 8.4977 | true | 36.5500 |
| Mortadella IGP massima con pistacchio | 3.11 | 9.99 | 31.07 | 9.9904 | true | 31.0689 |
| Bresaola punta d'anca oro | 1.83 | 27.04 | 49.48 | 27.0383 | true | 49.4832 |

## Task 5 — Discount handling (bindMonetaryColumns)

**Rule:** total÷qty when total < qty×unit_price AND discount_pct is null

| Scenario | bound unit_price | bound total | effective paid | uses effective? |
|----------|------------------|-------------|----------------|---------------|
| pre_discount_gross_only | 12.9 | 13.55 | 12.9048 | true |
| post_discount_gross_and_pct | 9.95 | 13.44 | 12.8000 | false |
| mixed_db_gorgonzola_no_discount_cols | 10.88 | 13.44 | 12.8000 | false |
| effective_paid_when_total_lt_qty_x_unit | 12.8 | 13.44 | 12.8000 | true |
| effective_paid_when_total_gt_qty_x_unit_gorgonzola_shape | 10.88 | 13.44 | 12.8000 | false |

## Task 6 — Gorgonzola recipe costing vs effective paid

| Quantity | Recipe cost (€) | Basis €/kg | Effective paid €/kg | Variance |
|----------|-----------------|------------|---------------------|----------|
| 100 g | 1.0880 | 10.88 | 12.80 | -1.92 €/kg (-15.0%) |
| 250 g | 2.7200 | | | |
| 500 g | 5.4400 | | | |
| 1000 g | 10.8800 | | | |

Recipe costing uses `current_price` (10.88) ÷ `purchase_quantity` (1000g) = **€10.88/kg**, not effective paid **€12.80/kg**.

## Task 7 — Historical pricing & alerts

### Gorgonzola DOP dolce

| created_at | new_price €/g | €/kg | matches unit_price basis? | matches effective paid? |
|------------|---------------|------|---------------------------|-------------------------|
| 2026-05-19T12:00:00+00:00 | 0.01088 | €10.88 | true | false |

### Prosciutto cotto scelto

| created_at | new_price €/g | €/kg | matches unit_price basis? | matches effective paid? |
|------------|---------------|------|---------------------------|-------------------------|
| 2026-05-19T12:00:00+00:00 | 0.0085 | €8.50 | true | true |

### Mortadella IGP massima con pistacchio

| created_at | new_price €/g | €/kg | matches unit_price basis? | matches effective paid? |
|------------|---------------|------|---------------------------|-------------------------|
| 2026-05-19T12:00:00+00:00 | 0.00999 | €9.99 | true | true |

### Bresaola punta d'anca oro

| created_at | new_price €/g | €/kg | matches unit_price basis? | matches effective paid? |
|------------|---------------|------|---------------------------|-------------------------|
| 2026-05-19T12:00:00+00:00 | 0.027039999999999998 | €27.04 | true | true |

margin-alerts.ts uses ingredient_price_history.new_price (operational €/g), same unit_price÷purchase_quantity basis — not line_total÷qty

## Final verdict

**D)** Data defect — Gorgonzola unit_price inconsistent with line arithmetic and PDF binding

Architectural basis is A (unit_price), but Gorgonzola invoice_items violate qty×unit_price=total. Displayed €10.88/kg mirrors unit_price; economically paid €12.80/kg (=13.44÷1.05) is not represented. bindMonetaryColumns applyEffectivePaidPrice only fires when total < qty×unit_price (gross-over-net); Gorgonzola has total > qty×unit_price so no rebind. Verdict D: data extraction defect, not intentional effective-paid semantics.

### For Gorgonzola: is €10.88/kg intended or should €12.80/kg?

- **Displayed (intended by code):** €10.88/kg — persisted invoice_items.unit_price passed through kg-row short-circuit
- **Economically paid:** €12.80/kg — line_total (13.44) ÷ quantity (1.05 kg)
- **PDF gross-discount binding would yield:** €9.95/kg from gross 12.90 × (1−22.85%)
- **Conclusion:** €10.88/kg is what Marginly displays because the pipeline treats unit_price as net €/kg; it is NOT the effective cost paid (€12.80/kg). The persisted unit_price itself is inconsistent with both PDF discount math and line arithmetic.