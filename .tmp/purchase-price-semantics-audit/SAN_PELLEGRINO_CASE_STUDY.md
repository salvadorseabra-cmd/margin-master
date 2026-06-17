# San Pellegrino Case Study

**Product:** SanPellegrino - Acqua in vitro 75cl x 15ud  
**Source:** `.tmp/emporio-italia-investigation/invoice-items.json`

## Primary invoice line

| Field | Value |
|-------|-------|
| Quantity | 2 |
| Unit | cx (cases) |
| Unit price | €19.30/case |
| Line total (paid) | **€38.56** |
| Supplier | Emporio Italia |
| Date | 2026-06-10 |

## Derived operational costs

| Metric | Calculation | Value |
|--------|-------------|-------|
| Invoice total | `invoice_items.total` | **€38.56** |
| Per case | €38.56 ÷ 2 | **€19.28/case** |
| Per bottle | €19.28 ÷ 15 bottles/case | **€1.29/bottle** |
| Per litre | 15 × 750ml = 11.25L/case; €19.28 ÷ 11.25 | **€1.71/L** |

---

## Quantity-variation evidence

From `.tmp/emporio-duplicate-audit/REPORT.md` — same product, different quantities:

| Purchase | Qty | Line total | Per case |
|----------|-----|------------|----------|
| Batch A | 1 cx | **€25.74** | €25.74/case |
| Batch B | 2 cx | **€38.56** | €19.28/case |

### Comparison outcomes

| Metric used | "Winner" | Correct? |
|-------------|----------|----------|
| Line total (current after refactor) | €25.74 (1 cx) | **No** — appears cheaper but is €25.74/case vs €19.28/case |
| Per case | €38.56 line (2 cx @ €19.28/case) | **Yes** |
| Per bottle / per litre | Same ranking as per case | **Yes** |

This is the clearest VL proof that Best Buy on line totals is semantically wrong.

---

## Would Best Buy be meaningful if based on…?

### A) Invoice total

**No** when quantity varies on the same SKU. The 1-case purchase looks cheaper (€25.74 < €38.56) but is actually worse value per case.

### B) Bottle cost

**Yes** for same pack structure (75cl × 15).

### C) Litre cost

**Yes** — especially if bottle sizes differ across suppliers.

---

## Recommendation for San Pellegrino

- **Last Paid / Purchase History:** show line totals (€38.56, €25.74) ✓
- **Best Buy / Highest Paid:** compare **€19.28/case** (or €/bottle, €/L), not raw line totals
