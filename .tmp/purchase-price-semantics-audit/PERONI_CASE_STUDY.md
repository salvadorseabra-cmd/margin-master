# Peroni Case Study

**Product:** Birra Peroni Nastro Azzurro PNA 33cl*24  
**Source:** `.tmp/field-accuracy-audit/extracted-data.json`, `.tmp/mammafiore-line-audit/pass-c-raw.json`

## Invoice line values

| Field | Value |
|-------|-------|
| Quantity | 24 |
| Unit | un |
| Unit price (list) | €1.529 |
| Line total (paid) | **€25.69** |
| Supplier | Mammafiore |

## Derived operational costs

| Metric | Calculation | Value |
|--------|-------------|-------|
| Invoice total | `invoice_items.total` | **€25.69** |
| Effective bottle cost | €25.69 ÷ 24 | **€1.07/bottle** |
| Litre cost | 24 × 330ml = 7.92L; €25.69 ÷ 7.92 | **€3.24/L** |

Note: `unit_price` (€1.529) is pre-discount list price; effective bottle cost uses line total.

---

## Would Best Buy be meaningful if based on…?

### A) Invoice total (line total)

**Partially.** Works only when every purchase uses the same quantity (always qty 24). If one supplier invoices qty 12 and another qty 24, line totals are not comparable.

### B) Bottle cost (€/bottle)

**Yes — best default** for this SKU. Same 33cl bottle size across suppliers; direct comparison of what each bottle costs after discounts.

### C) Litre cost (€/L)

**Yes — when pack sizes differ.** If Peroni appears as `33cl*24` vs `33cl*12` or different cl sizes, normalizing to €/L enables fair comparison.

---

## Recommendation for Peroni

- **Last Paid / Purchase History:** show **€25.69** (invoice total) ✓
- **Best Buy / Highest Paid:** compare **€1.07/bottle** or **€3.24/L**, not €25.69
