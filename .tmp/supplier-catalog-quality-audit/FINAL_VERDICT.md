# Final Verdict — Supplier Catalog Quality

**Date:** 2026-06-15

## Summary

| Metric | Value |
|---|---|
| Real-world suppliers | **5** |
| Invoice rows | **6** |
| Distinct supplier_name strings | **6** (+ Avijudo in aliases) |
| Duplicate candidates | HIGH 1, MEDIUM 2, LOW 2 |
| Casing issues | **4** material |

## Identity risks

- No `supplier_id` — denormalized text only
- Aviludo split across 3 spellings
- Alias keys case-sensitive; watchlist case-insensitive
- OCR typo `Avijudo` persisted
- Emporio lines wiped — supplier metrics incomplete

## Recommended next action

1. `normalizeSupplierKey` + case-folding + typo map
2. Backfill invoices, aliases, price_history
3. Re-read Emporio before trusting supplier watch

VL usable at 5-supplier scale; identity fragmentation is the main debt.
