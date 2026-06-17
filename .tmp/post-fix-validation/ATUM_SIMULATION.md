# Atum Simulation — Post Fix

**Input:** qty=2, unit_price=6.29, total=12.58, name=`Atum Óleo Bolsa Nau Catrineta 1 Kg`

**Method:** `vite-node` + current codebase imports

---

## Pipeline trace

| Step | Function | Result |
|------|----------|--------|
| 1 | `normalizeInvoiceItemFields` | `{ quantity: 2, unit: "un", unit_price: 6.29, total: 12.58 }` |
| 2 | `resolveCountablePurchaseQuantityForCost` | **1** (`isUnitPricePerPricedUnit`: 2×6.29≈12.58) |
| 3 | `operationalCostFieldsFromInvoiceLine` | `{ current_price: 6.29, purchase_quantity: 1 }` |
| 4 | `operationalUnitPriceForPriceHistory(6.29, 1)` | **6.29** |

---

## Expected vs actual

| Field | Expected | Actual | Result |
|-------|----------|--------|--------|
| `purchase_quantity` | 1 | 1 | **PASS** |
| `history_price` | 6.29 | 6.29 | **PASS** |

Vitest: `ingredient-price-history-persistence.test.ts` Atum persist case — **PASS**
