# Code Path Validation

## Intended path (tests/scripts — passes `total`)

```
operationalCostFieldsFromInvoiceLine(total)
  → isUnitPricePerPricedUnit(line_total) → pq=1 for Atum/Gema
  → operationalUnitPriceForPriceHistory → correct op
```

## Production path (gap)

```
invoices.tsx / ingredient-operational-intelligence.ts
  → { name, quantity, unit, unit_price } // NO total
  → purchase_quantity = rowQty
  → op = unit_price / rowQty → contamination
```

| Case | With line_total | Production (no total) |
|------|-----------------|----------------------|
| Atum 2×€6.29 | pq=1, op **€6.29** | pq=2, op **€3.145** ❌ |
| Gema 6×€10.19 | pq=1, op **€10.19** | pq=6, op **€1.698** ❌ |
| Pepino 1 cx | pq=6, op €3.665 | same ✅ |
| Arroz 1 cx | pq=12, op €1.121 | same ✅ |

**Fix exists** in `isUnitPricePerPricedUnit` but **not wired** through live persist callers.
