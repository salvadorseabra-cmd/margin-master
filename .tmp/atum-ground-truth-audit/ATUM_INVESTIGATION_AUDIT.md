# Atum Investigation Audit — Prior Findings

Classification: **Proven** | **Assumption** | **Invalidated**

---

## `atum-price-history-investigation`

| Conclusion | Classification |
|------------|----------------|
| April history €3.145 (should €6.29) | **Proven** |
| Root cause = divide by qty when `unit_price` already per bag | **Proven** |
| May history €13.10 is correct | **Invalidated** — invoice is 2×€6.55 |
| +108% alert is economically correct | **Invalidated** — true move is +4.1% |
| Unit vs line total NOT the issue | **Partially invalidated** — May error is line-total-as-unit-price extraction |

---

## `historical-pricing-contamination-audit`

| Conclusion | Classification |
|------------|----------------|
| 10/27 rows contaminated (37%) | **Proven** (pattern) |
| May row "clean" for Atum | **Invalidated** — used wrong item / expected op |
| `current_price` €13.10 correct | **Invalidated** vs invoice |

---

## `forward-persistence-validation`

| Conclusion | Classification |
|------------|----------------|
| Code fix exists (`isUnitPricePerPricedUnit`) | **Proven** |
| Live DB not backfilled / bug still alive | **Assumption** (snapshot supports; not re-queried live) |
| +316% in DB wrong (chained off April) | **Proven** (mechanism); true delta should be +4.1% |
