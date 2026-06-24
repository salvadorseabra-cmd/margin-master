# Emporio Italia Deli Family — Mathematical Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (19 May 2026) · **Read-only** · 2026-06-24
**Extends:** [.tmp/ingredient-procurement-operational-duplication-audit](../ingredient-procurement-operational-duplication-audit/REPORT.md)

## Required table

| Product | Procurement Cost | Operational Cost | Same Unit | Same Cost | Adds Information? |
|---------|------------------|------------------|-----------|-----------|-------------------|
| Gorgonzola DOP dolce | €10.88 / kg | €10.88 / kg | YES | YES | NO |
| Prosciutto cotto scelto | €8.50 / kg | €8.50 / kg | YES | YES | NO |
| Mortadella IGP massima con pistacchio | €9.99 / kg | €9.99 / kg | YES | YES | NO |
| Bresaola punta d'anca oro | €27.04 / kg | €27.04 / kg | YES | YES | NO |

## Task 3 — Equality test (all four)

| Product | Procurement | Operational | Equal? | Transformation? |
|---------|-------------|-------------|--------|-----------------|
| Gorgonzola DOP dolce | €10.88 / kg | €10.88 / kg | YES | — |
| Prosciutto cotto scelto | €8.50 / kg | €8.50 / kg | YES | — |
| Mortadella IGP massima con pistacchio | €9.99 / kg | €9.99 / kg | YES | — |
| Bresaola punta d'anca oro | €27.04 / kg | €27.04 / kg | YES | — |

## Task 2 — Gorgonzola deep audit

### Variables

| Variable | Value |
|----------|-------|
| line_total | 13.44 |
| unit_price | 10.88 |
| extractedQty | 1.05 |
| extractedUnit | kg |
| purchase_structure_kind | weight_or_volume |
| usable_quantity_from_structure | 1500 |
| usable_unit | g |
| purchase_quantity_recipe | 1000 |
| current_price | 10.88 |
| operational_denominator_g | 1000 |
| operational_denominator_kg | 1 |
| formula_effective | unit_price / (operational_denominator_g / 1000) = effective.cost €/kg |
| computed_effective_eur_per_kg | 10.88 |
| line_total_div_operational_denominator_g | 0.013439999999999999 |
| line_total_div_purchased_g | 0.012799999999999999 |
| line_total_div_qty_kg | 12.799999999999999 |
| recipe_eur_per_kg | 10.88 |
| reconciles_to_expected_eur_per_kg | true |

### Reconciliation to €10.88/kg

- **unit_price_is_operational_for_kg_row:** true
- **effective_cost_equals_unit_price:** true
- **recipe_current_price_over_purchase_quantity_times_1000:** 10.88
- **reconciles_to_10_88_eur_per_kg:** true
- **note_line_total_not_used_for_operational_cost:** Operational cost derives from unit_price (€/kg), not line_total/qty. line_total/qty_kg = weighed effective rate; line_total/operational_denominator_g ≠ €/kg because denominator is per-priced-kg (1000g), not purchased weight.

For kg-priced invoice rows, `recipeOperationalCostFieldsFromInvoiceLine` short-circuits to `{ current_price: unit_price, purchase_quantity: 1000, cost_base_unit: g }`. Operational €/kg = `unit_price / (perUnit_g/1000)` = `unit_price` = **€10.88/kg**. `line_total ÷ purchased_g` reflects weighed quantity (1.05 kg → €12.80/kg effective from total); operational cost intentionally uses list `unit_price`, not derived line_total rate.

## Task 1 — Gorgonzola DOP dolce

### Pipeline trace

| Stage | Key fields |
|-------|------------|
| Invoice item | {"id":"bece238e-fd6d-493c-8555-6921b164f97c","name":"Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg","quantity":1.05,"unit":"kg","unit_price":10.88,"line_total":13.44} |
| Purchase format | kind=weight_or_volume, normalized=1500g |
| Procurement | {"current_price":10.88,"purchase_quantity":1000,"purchase_unit":"g","base_unit":"g","unit":"g","includeCatalogUnitFields":false} |
| Operational persist | {"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"} |
| Recipe fields | {"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"} |
| perUnit | {"amount":1000,"unit":"g"} |
| effective | {"cost":10.88,"unit":"kg"} |
| Presentation | procurement=€10.88 / kg, operational=€10.88 / kg |

**Equality:** YES — unit_price (10.88) / (usable_per_unit 1000g) = effective.cost (10.8800) kg

### Task 4 — Recipe costing

| Quantity | Cost (€) |
|----------|----------|
| 100 g | 1.0880 |
| 250 g | 2.7200 |
| 1 kg | 10.8800 |
| Denominator | 1000g |
| KPI label | €10.88/kg |
| €/kg from operational fields | €10.88/kg |

### Task 5 — Presentation: adds information? **NO**

## Task 1 — Prosciutto cotto scelto

### Pipeline trace

| Stage | Key fields |
|-------|------------|
| Invoice item | {"id":"a8b35610-6459-404a-96be-12fe970a50bc","name":"Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG","quantity":4.3,"unit":"kg","unit_price":8.5,"line_total":36.54} |
| Purchase format | kind=weight_or_volume, normalized=4500g |
| Procurement | {"current_price":8.5,"purchase_quantity":1000,"purchase_unit":"g","base_unit":"g","unit":"g","includeCatalogUnitFields":false} |
| Operational persist | {"current_price":8.5,"purchase_quantity":1000,"cost_base_unit":"g"} |
| Recipe fields | {"current_price":8.5,"purchase_quantity":1000,"cost_base_unit":"g"} |
| perUnit | {"amount":1000,"unit":"g"} |
| effective | {"cost":8.5,"unit":"kg"} |
| Presentation | procurement=€8.50 / kg, operational=€8.50 / kg |

**Equality:** YES — unit_price (8.5) / (usable_per_unit 1000g) = effective.cost (8.5000) kg

### Task 4 — Recipe costing

| Quantity | Cost (€) |
|----------|----------|
| 100 g | 0.8500 |
| 250 g | 2.1250 |
| 1 kg | 8.5000 |
| Denominator | 1000g |
| KPI label | €8.50/kg |
| €/kg from operational fields | €8.50/kg |

### Task 5 — Presentation: adds information? **NO**

## Task 1 — Mortadella IGP massima con pistacchio

### Pipeline trace

| Stage | Key fields |
|-------|------------|
| Invoice item | {"id":"b28d90e7-e53d-4365-b535-5abe7addebdb","name":"Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5kg","quantity":3.11,"unit":"kg","unit_price":9.99,"line_total":31.07} |
| Purchase format | kind=weight_or_volume, normalized=3500g |
| Procurement | {"current_price":9.99,"purchase_quantity":1000,"purchase_unit":"g","base_unit":"g","unit":"g","includeCatalogUnitFields":false} |
| Operational persist | {"current_price":9.99,"purchase_quantity":1000,"cost_base_unit":"g"} |
| Recipe fields | {"current_price":9.99,"purchase_quantity":1000,"cost_base_unit":"g"} |
| perUnit | {"amount":1000,"unit":"g"} |
| effective | {"cost":9.99,"unit":"kg"} |
| Presentation | procurement=€9.99 / kg, operational=€9.99 / kg |

**Equality:** YES — unit_price (9.99) / (usable_per_unit 1000g) = effective.cost (9.9900) kg

### Task 4 — Recipe costing

| Quantity | Cost (€) |
|----------|----------|
| 100 g | 0.9990 |
| 250 g | 2.4975 |
| 1 kg | 9.9900 |
| Denominator | 1000g |
| KPI label | €9.99/kg |
| €/kg from operational fields | €9.99/kg |

### Task 5 — Presentation: adds information? **NO**

## Task 1 — Bresaola punta d'anca oro

### Pipeline trace

| Stage | Key fields |
|-------|------------|
| Invoice item | {"id":"5dc2c383-4d58-4de3-b829-60d111357c40","name":"Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5kg","quantity":1.83,"unit":"kg","unit_price":27.04,"line_total":49.48} |
| Purchase format | kind=weight_or_volume, normalized=1500g |
| Procurement | {"current_price":27.04,"purchase_quantity":1000,"purchase_unit":"g","base_unit":"g","unit":"g","includeCatalogUnitFields":false} |
| Operational persist | {"current_price":27.04,"purchase_quantity":1000,"cost_base_unit":"g"} |
| Recipe fields | {"current_price":27.04,"purchase_quantity":1000,"cost_base_unit":"g"} |
| perUnit | {"amount":1000,"unit":"g"} |
| effective | {"cost":27.04,"unit":"kg"} |
| Presentation | procurement=€27.04 / kg, operational=€27.04 / kg |

**Equality:** YES — unit_price (27.04) / (usable_per_unit 1000g) = effective.cost (27.0400) kg

### Task 4 — Recipe costing

| Quantity | Cost (€) |
|----------|----------|
| 100 g | 2.7040 |
| 250 g | 6.7600 |
| 1 kg | 27.0400 |
| Denominator | 1000g |
| KPI label | €27.04/kg |
| €/kg from operational fields | €27.04/kg |

### Task 5 — Presentation: adds information? **NO**

## Task 6 — Blast radius (VL)

- Total ingredients: **40**
- With matched invoice line traced: **40**
- Procurement == Operational (unit + cost): **12**

| Ingredient | Procurement | Operational |
|------------|-------------|-------------|
| Abóbora butternut | €0.99 / kg | €0.99 / kg |
| Alho francês | €1.42 / kg | €1.42 / kg |
| Courgettes | €1.56 / kg | €1.56 / kg |
| Gorgonzola DOP dolce | €10.88 / kg | €10.88 / kg |
| Hortelã | €5.40 / kg | €5.40 / kg |
| Manteiga s/sal | €8.90 / kg | €8.90 / kg |
| Mortadella IGP massima con pistacchio | €9.99 / kg | €9.99 / kg |
| Pepino fresco | €1.42 / kg | €1.42 / kg |
| Pêra abacate | €4.26 / kg | €4.26 / kg |
| Prosciutto cotto scelto | €8.50 / kg | €8.50 / kg |
| Rigamonti bresaola punta d'anca oro | €27.04 / kg | €27.04 / kg |
| Rovagnati salame ventricina | €15.19 / kg | €15.19 / kg |

## Final verdict

**Classification: B**

**Would hiding Operational Cost change recipe costing, intelligence, pricing history, or operational calculations?**

**NO** — For all four Emporio deli family products, procurement and operational €/kg are mathematically identical. Recipe costing uses recipeOperationalCostFieldsFromInvoiceLine (current_price=unit_price, purchase_quantity=1000, cost_base_unit=g) yielding the same €/kg as procurement display. Hiding Operational Cost on ingredient detail removes no computation input; presentation-only duplicate.