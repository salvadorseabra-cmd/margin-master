# AI Extraction Analysis — Lenha Invoice

**Date:** 2026-06-15

## AI output

**`items: []`** — valid JSON, not malformed.

Metadata populated correctly:
- supplier: Mais Lenhas & Carvão, Unipessoal, Lda.
- invoice_date: 2026-05-23
- total: 75

Empty items array is **faithful to crop content** — no product rows visible in the table crop sent to GPT Pass D.

AI did not fail; it correctly reported zero line items from a crop that excluded the product table.
