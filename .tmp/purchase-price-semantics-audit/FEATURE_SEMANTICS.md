# Feature Semantics — What Users Expect

Each Ingredient Costs surface answers a different question. Invoice validation and procurement intelligence have different mental models.

| Feature | Question being answered | Correct metric type | VL example |
|---------|------------------------|---------------------|------------|
| **Last Paid** | "How much did I actually pay on my most recent invoice for this ingredient?" | Invoice line total (cash out) | Peroni: **€25.69** — Mammafiore, qty 24, `invoice_items.total` (`.tmp/field-accuracy-audit/extracted-data.json`) |
| **Purchase History** | "What did each past purchase cost on the invoice?" | Invoice line total per row | San Pellegrino: **€38.56** on 2026-06-10 Emporio (`.tmp/emporio-italia-investigation/invoice-items.json`) |
| **Best Buy** | "Which supplier/date gave the best unit economics for this ingredient?" | Normalized comparable price (€/kg, €/L, €/bottle, €/case) | Bacon: Metro **€8.50/kg** vs Auchan **€9.99/kg** — not €50.20 vs €9.99 line totals |
| **Highest Paid** | "Which purchase was most expensive per comparable unit?" | Same normalized metric as Best Buy | Same bacon example — highest **per-kg** rate, not largest invoice line |

## User mental models

**Invoice validation** (Last Paid, Purchase History): the user is reconciling against a paper/PDF invoice. They expect the number on screen to match the line total they paid, not a derived unit rate.

**Procurement intelligence** (Best Buy, Highest Paid): the user is comparing value across time and suppliers. They expect apples-to-apples unit economics, even when pack size or quantity on the invoice line differs.
