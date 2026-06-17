# Final Verdict — Historical Pricing Contamination

## Summary table

| Metric | Value |
|--------|------:|
| Total history rows | 27 |
| Clean rows | 17 |
| Contaminated rows | **10** |
| Contamination rate | **37.0%** |
| Quantity-division cases | **10** |
| Pack/unit cases | 0 |
| Top affected ingredient | Birra Peroni (+1275%) |
| Historical pricing trustworthy? | **NO** |

## Answers

| Question | Answer |
|----------|--------|
| Is Atum isolated? | **No** — 10 rows / 7 ingredients |
| Trustworthy for deltas/chains? | **No** — repair/backfill required |
| Trustworthy for invoice unit alerts? | **Partially** — purchase memory more reliable |
| Repair required? | **Yes** — code fix exists; DB regressed |

**Atum proof:** Apr history €3.145 (should €6.29); May delta +316.5% (should +108.3%).
