# Supplier Creation Flow

**Date:** 2026-06-15

```
Upload → invoices.insert(supplier_name = filename fallback)
  → extract-invoice edge fn
  → Pass 2b: extractMetadataFromImage() → raw legal supplier from header
  → No server-side normalization
  → invoices.tsx runExtraction()
  → normalizeSupplierDisplayName(data.supplier)
  → uploadOne() update: supplier_name = ext?.supplier?.slice(0,120)
  → ingredient_aliases / price_history: normalizeSupplierScope() on confirm
```

## Key files

- `supabase/functions/extract-invoice/invoice-metadata-extraction.ts`
- `src/lib/supplier-identity.ts` — `normalizeSupplierDisplayName`
- `src/routes/invoices.tsx` — `uploadOne`, `runExtraction`
- `src/lib/ingredient-alias-lookup.ts`, `operational-intelligence-view.ts`

## Source of truth today

**No canonical supplier entity.** Each invoice gets OCR output + display normalization. Historical rows may bypass consistent normalization. No dedup on insert. Identity = **normalized display string**, not stable ID.
