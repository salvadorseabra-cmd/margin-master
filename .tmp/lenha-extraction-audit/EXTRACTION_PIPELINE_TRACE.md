# Extraction Pipeline Trace — Lenha Invoice

**Date:** 2026-06-15  
**Invoice ID:** `342d930b-7784-45d9-8db9-43e2a29baf61`

---

## Full path

```
uploadOne (invoices.tsx)
  → storage.upload + invoices.insert (total=0)
  → fileToExtractionDataUrl
  → runExtraction
  → supabase.functions.invoke("extract-invoice")
  → extractIssueDateFromImage (Pass A)
  → extractMetadataFromImage (Pass B — supplier)
  → extractFooterMetadataFromImage (Pass C — total)
  → extractTableItemsFromImage (Pass D)
  → cropTableRegionForLineItems / detectTableBounds ← FAILURE HERE
  → callOpenAiJson (GPT table pass)
  → bindMonetaryColumns / parseMonetaryLineItems
  → reconcileLineItemAmounts
  → finalizeExtractedLineItems
  → normalizeInvoiceItemFields
  → shouldRejectInvoiceIngredientRow filter
  → [if 0 accepted] return null — no DELETE/INSERT
  → [else] DELETE + INSERT invoice_items
  → [if ext non-null] update invoices header
```

## Key files

- `supabase/functions/extract-invoice/index.ts`
- `invoice-table-extraction.ts`
- `invoice-image-crop.ts`
- `src/routes/invoices.tsx` — `runExtraction`, `uploadOne`, `reExtract`
