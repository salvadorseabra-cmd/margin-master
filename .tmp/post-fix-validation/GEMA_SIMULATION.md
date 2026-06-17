# Gema Simulation — Post Fix

**Input:** qty=6, unit_price=10.19, total=61.14, name=`Ovo Gema 1kg`

**Method:** `vite-node` + current codebase imports

---

## Pipeline trace

| Step | Function | Result |
|------|----------|--------|
| 1 | `normalizeInvoiceItemFields` | `{ quantity: 6, unit: "un", unit_price: 10.19, total: 61.14 }` |
| 2 | `resolveCountablePurchaseQuantityForCost` | **1** |
| 3 | `operationalCostFieldsFromInvoiceLine` | `{ current_price: 10.19, purchase_quantity: 1 }` |
| 4 | `operationalUnitPriceForPriceHistory(10.19, 1)` | **10.19** |

---

## Expected vs actual

| Field | Expected | Actual | Result |
|-------|----------|--------|--------|
| `purchase_quantity` | 1 | 1 | **PASS** |
| `history_price` | 10.19 | 10.19 | **PASS** |
