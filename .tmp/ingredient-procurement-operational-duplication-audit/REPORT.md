# Ingredient Procurement vs Operational Cost Duplication Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-24

## Code path confirmation

- **Ingredient detail** (`buildLastPurchaseCostPresentation`): uses `resolvePurchaseCostLabels` → `presentation.priceDisplay` + `presentation.effectiveUsableCostLabel` — **does NOT** apply `shouldCollapseInvoiceOperationalDisplay`.
- **Invoice Review** (`buildNormalizationCard`): applies `shouldCollapseInvoiceOperationalDisplay` to hide duplicate operational block.
- **Recipe costing**: `recipeOperationalCostFieldsFromInvoiceLine` / `effectiveIngredientUnitCostEur` — uses persisted operational fields, not display labels.

## Required summary table

| Ingredient | Procurement | Operational | Same? | Recipe Uses Which? |
|------------|-------------|-------------|-------|-------------------|
| Gorgonzola | €10.88 / kg | €10.88 / kg | YES | operational fields: current_price=10.88, purchase_quantity=1000, cost_base_unit=g |
| Prosciutto cotto scelto | €8.50 / kg | €8.50 / kg | YES | operational fields: current_price=8.5, purchase_quantity=1000, cost_base_unit=g |
| Mortadella IGP massima con pistachio | €9.99 / kg | €9.99 / kg | YES | operational fields: current_price=9.99, purchase_quantity=1000, cost_base_unit=g |
| Bresaola punta d'anca oro | €27.04 / kg | €27.04 / kg | YES | operational fields: current_price=27.04, purchase_quantity=1000, cost_base_unit=g |

## Gorgonzola

### Q1 Procurement trace
| Field | Value |
|-------|-------|
| Purchase Qty | 1.05 |
| Purchase Unit | kg |
| unit_price | €10.88 |
| total | €13.44 |
| purchase structure | {"purchaseQuantity":1,"purchaseFormat":"unit","unitSize":1.5,"unitMeasurement":"kg","totalUsableAmount":1500,"usableUnit":"g","matchedText":"1,5kg","tier":"bare_measure"} |
| procurement denominator | 1000 |
| Procurement Cost | €10.88 / kg |

### Q2 Operational trace
| Field | Value |
|-------|-------|
| Operational Qty (per priced unit) | 1000 |
| Operational Unit | g |
| Operational Cost | €10.88 / kg |
| normalization path | weight_or_volume |

### Q3 Mathematical comparison: **YES**
Formula: unit_price (10.88) / (usable_per_unit) = effective.cost (10.8800) kg; priceSuffix matches effective.unit

### Q4 Recipe costing
| Field | Value |
|-------|-------|
| current_price | 10.88 |
| purchase_quantity (denominator) | 1000 |
| cost_base_unit | g |

### Q5 Classification: **B**
- A = transforms, B = equals procurement, C = future field, D = data issue

Invoice review would collapse operational: **false**
Purchase memory row: procurement=€10.88 / kg, operational=€10.88 / kg

## Prosciutto cotto scelto

### Q1 Procurement trace
| Field | Value |
|-------|-------|
| Purchase Qty | 4.3 |
| Purchase Unit | kg |
| unit_price | €8.5 |
| total | €36.54 |
| purchase structure | {"purchaseQuantity":1,"purchaseFormat":"unit","unitSize":4.5,"unitMeasurement":"kg","totalUsableAmount":4500,"usableUnit":"g","matchedText":"4,5KG","tier":"bare_measure"} |
| procurement denominator | 1000 |
| Procurement Cost | €8.50 / kg |

### Q2 Operational trace
| Field | Value |
|-------|-------|
| Operational Qty (per priced unit) | 1000 |
| Operational Unit | g |
| Operational Cost | €8.50 / kg |
| normalization path | weight_or_volume |

### Q3 Mathematical comparison: **YES**
Formula: unit_price (8.5) / (usable_per_unit) = effective.cost (8.5000) kg; priceSuffix matches effective.unit

### Q4 Recipe costing
| Field | Value |
|-------|-------|
| current_price | 8.5 |
| purchase_quantity (denominator) | 1000 |
| cost_base_unit | g |

### Q5 Classification: **B**
- A = transforms, B = equals procurement, C = future field, D = data issue

Invoice review would collapse operational: **false**
Purchase memory row: procurement=€8.50 / kg, operational=€8.50 / kg

## Mortadella IGP massima con pistachio

### Q1 Procurement trace
| Field | Value |
|-------|-------|
| Purchase Qty | 3.11 |
| Purchase Unit | kg |
| unit_price | €9.99 |
| total | €31.07 |
| purchase structure | {"purchaseQuantity":1,"purchaseFormat":"unit","unitSize":3.5,"unitMeasurement":"kg","totalUsableAmount":3500,"usableUnit":"g","matchedText":"3,5kg","tier":"bare_measure"} |
| procurement denominator | 1000 |
| Procurement Cost | €9.99 / kg |

### Q2 Operational trace
| Field | Value |
|-------|-------|
| Operational Qty (per priced unit) | 1000 |
| Operational Unit | g |
| Operational Cost | €9.99 / kg |
| normalization path | weight_or_volume |

### Q3 Mathematical comparison: **YES**
Formula: unit_price (9.99) / (usable_per_unit) = effective.cost (9.9900) kg; priceSuffix matches effective.unit

### Q4 Recipe costing
| Field | Value |
|-------|-------|
| current_price | 9.99 |
| purchase_quantity (denominator) | 1000 |
| cost_base_unit | g |

### Q5 Classification: **B**
- A = transforms, B = equals procurement, C = future field, D = data issue

Invoice review would collapse operational: **false**
Purchase memory row: procurement=€9.99 / kg, operational=€9.99 / kg

## Bresaola punta d'anca oro

### Q1 Procurement trace
| Field | Value |
|-------|-------|
| Purchase Qty | 1.83 |
| Purchase Unit | kg |
| unit_price | €27.04 |
| total | €49.48 |
| purchase structure | {"purchaseQuantity":1,"purchaseFormat":"unit","unitSize":1.5,"unitMeasurement":"kg","totalUsableAmount":1500,"usableUnit":"g","matchedText":"1,5kg","tier":"bare_measure"} |
| procurement denominator | 1000 |
| Procurement Cost | €27.04 / kg |

### Q2 Operational trace
| Field | Value |
|-------|-------|
| Operational Qty (per priced unit) | 1000 |
| Operational Unit | g |
| Operational Cost | €27.04 / kg |
| normalization path | weight_or_volume |

### Q3 Mathematical comparison: **YES**
Formula: unit_price (27.04) / (usable_per_unit) = effective.cost (27.0400) kg; priceSuffix matches effective.unit

### Q4 Recipe costing
| Field | Value |
|-------|-------|
| current_price | 27.04 |
| purchase_quantity (denominator) | 1000 |
| cost_base_unit | g |

### Q5 Classification: **B**
- A = transforms, B = equals procurement, C = future field, D = data issue

Invoice review would collapse operational: **false**
Purchase memory row: procurement=€27.04 / kg, operational=€27.04 / kg

## Q6 Control comparison

| Control | Procurement | Operational | Same? | Operational adds info? |
|---------|-------------|-------------|-------|-------------------------|
| Ovo Classe M | €38.44 / case | €0.2136 / egg | NO | YES |
| Pellegrino | €19.28 / case | €1.71 / L | NO | YES |
| Ginger Beer | €0.81 / unit | €4.05 / L | NO | YES |
| Paccheri | €22.05 / case | €3.68 / kg | NO | YES |
| Salada ibérica | €2.19 / pack | €8.76 / kg | NO | YES |
| Tomilho | €2.06 / bunch | €20.60 / kg | NO | YES |
| Manjericão | €2.06 / bunch | €20.60 / kg | NO | YES |

Controls where operational **adds** info transform purchase units (bunch→kg, bottle→L, case→unit) or apply conversion hints. Kg-priced deli items match procurement exactly like Courgettes test case.

## Q7 Ingredient page presentation

`buildLastPurchaseCostPresentation` always renders both lines when labels exist:
- Line 1: Procurement Cost → `presentation.priceDisplay`
- Line 2: Operational Cost → `presentation.effectiveUsableCostLabel`

For the four deli ingredients priced €/kg on invoice, both Procurement Cost and Operational Cost show **identical €/kg** — the Operational Cost line adds **no new cost information** on ingredient detail.

Note: Invoice Review also shows both cost lines for these items (`collapseOperational=false`) because purchased row weight (e.g. 1.05 kg) differs from pack-size normalization (e.g. 1.5 kg usable from product name). Invoice Review additionally surfaces pack normalization in a separate "Normalized" block; ingredient detail economics card does not.

## Final verdict

**Classification: B** (operational equals procurement for all four targets)

**Answer:** Would hiding Operational Cost for these four remove any information used by Marginly?

**NO** — recipe costing uses `recipeOperationalCostFieldsFromInvoiceLine` / persisted `current_price`+`purchase_quantity`+`cost_base_unit` (g denominator), which for kg-priced charcuterie/cheese yields the same €/kg as procurement. The duplicate Operational Cost line on the ingredient purchase economics card is presentation-only and removes no Marginly computation input.