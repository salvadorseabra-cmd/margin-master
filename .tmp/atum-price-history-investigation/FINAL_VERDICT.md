# Final Verdict — Atum Price History

## Summary table

| Stage | Value |
|-------|-------|
| April invoice unit price | **€6.29** |
| April invoice line total | **€12.58** |
| April history stored price | **€3.145** ❌ |
| May invoice unit price | **€13.10** |
| May invoice line total | **€13.10** |
| May history stored price | **€13.10** ✅ |
| First appearance of €13.10 | May 19 invoice `unit_price` |
| Root cause | **Double-divide on April persist** — not unit vs line total |

## Verdict

| Question | Answer |
|----------|--------|
| Real bug? | **Yes** — in `ingredient_price_history` persistence |
| Unit vs line total? | **No** |
| Contamination locus | `appendIngredientPriceHistoryFromInvoiceLine` → divided €6.29 by qty=2 |
| +108% alert correct? | **Yes** — uses invoice unit prices |
| +316% in DB? | **Wrong** — chained off corrupted April prior |

**Code fix exists** (`isUnitPricePerPricedUnit`) but **live DB not backfilled**.
