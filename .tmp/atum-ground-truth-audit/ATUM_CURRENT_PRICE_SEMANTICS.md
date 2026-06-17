# Atum Current Price Semantics

**Question:** What does `ingredients.current_price` mean for Atum?

---

## Code definitions

| Label | Meaning | Code |
|-------|---------|------|
| **A — Pack price** | Invoice line `unit_price` (per bag/tin when OCR correct) | `recipeOperationalCostFieldsFromInvoiceLine` → `current_price: unitPrice` |
| **B — purchase_quantity** | Denominator for operational cost | `resolveCountablePurchaseQuantityForCost` |
| **C — Operational price** | `current_price / purchase_quantity` | `resolvedOperationalUnitCostEur` |
| **D — History new_price** | Operational via `operationalUnitPriceForPriceHistory` | `ingredient-price-history.ts:149–160` |

---

## Atum applied semantics

| Stage | `current_price` | `purchase_quantity` | Operational | Correct? |
|-------|-----------------|---------------------|-------------|------------|
| April persist (bug) | 6.29 | 2 | 3.145 | ❌ op should be 6.29 |
| May persist (wrong row) | 13.10 | 1 | 13.10 | ❌ should be 6.55 |
| Invoice truth | 6.29 / 6.55 | 1 (per bag) | 6.29 / 6.55 | ✅ |

---

## Proof

`current_price` is **D) pack price** (invoice `unit_price`), not line total.

Operational = **C)** `current_price / purchase_quantity`.

DB shows `current_price=13.10` because May used item `79956d1b` where line total was stored as `unit_price` — not because `current_price` means line total by design.

April `new_price=3.145` in history = `operationalUnitPriceForPriceHistory(6.29, 2)` — pack price divided by wrong `purchase_quantity`.
