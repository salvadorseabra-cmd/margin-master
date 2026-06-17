# Pipeline Trace — Produto de Stock

**Date:** 2026-06-15

---

## End-to-end flow

```
Invoice image
  → cropTableRegionForLineItems()
  → GPT vision (invoice-table-extraction.ts) — items[].name WITH "Produto de Stock"
  → Client runExtraction → invoice_items.name persisted as-is
  → normalizeInvoiceItemFields() → cleanInvoiceItemDisplayName() — does NOT strip suffix
  → normalizeInvoiceIngredientName() — no "produto de stock" in COMMERCIAL_PHRASES
  → buildCanonicalIngredientCreateDefaults()
  → formatCanonicalIngredientDisplayName(invoiceAlias) — passes suffix through
  → UI shows contaminated suggestion
```

---

## First appearance

**GPT extraction JSON** (`items[].name`) — before persistence or canonical generation.

Physical source: Emporio Designação column prints `… / Produto de Stock` as boilerplate (`.tmp/column-selection-deep-dive/column-reconstruction.json`).

---

## Timeline

| State | When |
|-------|------|
| Clean | Historical DB Jun 10, v26 extract, stability runs 1 & 8 |
| Contaminated | PassC reextract Jun 11, duplicate-trace DB, most stability runs 2–7, 9–10 |

Regression correlates with extraction/crop changes after Jun 10 — text is on invoice, not hallucinated.
