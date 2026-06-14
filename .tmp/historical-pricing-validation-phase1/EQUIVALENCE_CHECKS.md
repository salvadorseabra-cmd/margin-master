# Equivalence Checks — Historical Pricing Validation Phase 1

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14

## Intended equivalence

All stored history values should be **€/same-base-unit** as recipe costing and catalog operational cost.

## Results

| Ingredient | History `ingredient_unit` | Actual stored base | Invoice raw comparable | Equivalent? |
|---|---|---|---|---|
| Pepino | un | €/un | €/jar (cx÷6) | ✅ |
| Arroz | un | €/un | €/bag (cx÷12) | ✅ |
| Anchoas | **g** | **€/un** (÷row qty) | €/tin | ❌ label + denominator |
| Gema | **g** | **€/un** (÷row qty) | €/tub | ❌ label + denominator |
| Atum | **g** | **€/un** (mixed) | **€/kg** | ❌ **non-comparable chain** |
| Mozzarella | un | €/un vs €/ball | different SKUs | ❌ **cross-pack compare** |

## Non-equivalent comparisons identified

1. **Atum Apr→May:** 3.145 vs 13.10 — compares half-per-bag vs full-per-bag, not €/kg
2. **Mozzarella Aviludo vs IL BOCCONCINO:** 13.69/kg-block vs 0.812/ball — different products
3. **History `ingredient_unit` vs operational base:** g-labeled rows holding €/un for Anchoas, Gema, Atum
4. **`created_at` vs invoice chronology:** 4/6 ingredients have May-2026 invoices stamped `2023-05-19`, inverting “latest” queries

## Unit conversion expectations

| Comparison type | Expected | Observed |
|---|---|---|
| €/kg ↔ €/kg | Same base | Atum: stored €/un, invoice is €/kg |
| €/L ↔ €/L | Same base | Not in sample |
| €/un ↔ €/un | Same base | Pepino, Arroz ✅; Anchoas/Gema mislabeled as g |
| Cross-pack (block vs ball) | Blocked or separate ingredients | Mozzarella: mixed on one ID |

## Per-invoice pipeline equivalence

For each confirmed purchase, `expected_operational` (from `operationalCostFieldsFromInvoiceLine` + `operationalUnitPriceForPriceHistory`) was compared to `ingredient_price_history.new_price`:

| Ingredient | All rows `op_matches_invoice` | Notes |
|---|---|---|
| Pepino | ✅ | Exact match |
| Arroz | ✅ | Exact match |
| Anchoas | ✅ | Pipeline-consistent but semantically wrong denominator |
| Gema | ✅ | Pipeline-consistent but semantically wrong denominator |
| Atum | ✅ | Pipeline-consistent; cross-row comparison invalid |
| Mozzarella | ✅ per row | Rows not comparable to each other |

**Conclusion:** Insert math is internally consistent with the pipeline; equivalence failures are semantic (wrong base, wrong denominator, cross-SKU).
