# Final Verdict — Atum Ground Truth Audit

**Mode:** Read-only. No fixes. No recommendations.

**Evidence hierarchy:** Physical invoices > DB row `6da6be6a` / `ff2ad683` > prior audit JSON

---

## Answers

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | True April price? | **€6.29 per 1 kg bag** | Invoice scan: 2 UN, total €12.58; DB `ff2ad683` |
| 2 | True May price? | **€6.55 per 1 kg bag** | Invoice scan: 2 UN, total €13.10; DB `6da6be6a` — not €13.10 |
| 3 | Correct % change? | **+4.1%** | (6.55−6.29)/6.29; not +108% or +316% |
| 4 | `ingredient_price_history` correct? | **No** | Apr 3.145, May 13.10, delta +316.5% all wrong |
| 5 | UI correct? | **No** | May purchase, catalog, alert use wrong row |
| 6 | Original contamination finding? | **Partially correct** | April divide-by-qty proven; May "clean" and +108% invalidated |

---

## Return table

| April true price | May true price | History correct? | UI correct? | Contamination finding |
|------------------|----------------|------------------|-------------|----------------------|
| **€6.29/bag** | **€6.55/bag** | **NO** | **NO** | **Partially correct** |

---

## Two distinct errors

1. **April:** Persistence double-divide (6.29 ÷ 2 → 3.145) — `line_total` wiring fix addresses this.
2. **May:** Wrong `invoice_items` row (`79956d1b`: 1×€13.10) used instead of correct row (`6da6be6a`: 2×€6.55) — extraction/confirmation issue, not the same bug class.
