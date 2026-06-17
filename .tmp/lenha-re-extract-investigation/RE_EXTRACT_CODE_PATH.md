# Re-Extract Code Path — Lenha Invoice

**Invoice ID:** `342d930b-7784-45d9-8db9-43e2a29baf61`

```
reExtract button
  → runExtraction
  → supabase.functions.invoke("extract-invoice") [remote v32]
  → Pass A/B/C OK (supplier, date, total=75)
  → Pass D: detectTableBounds anchors footer IVA band → crop excludes product row
  → GPT returns items: []
  → client: normalizedItems.length === 0
  → toast "Extraction returned no line items — existing rows kept"
  → return null → no DELETE/INSERT, header update skipped (total stays €0)
```

Toast fires in `src/routes/invoices.tsx` when `normalizedItems.length === 0`.
