# upsertConfirmedAlias Call Graph

```
upsertConfirmedAlias [ingredient-alias-memory.ts]
├── releaseStaleAliasOwnership → DELETE stale rows
├── UPDATE / INSERT ingredient_aliases

PRODUCTION (LIVE):
persistManualIngredientCorrection [ingredient-correction-memory.ts]
├── confirmIngredientMatch [invoices.tsx] — Confirm Match
├── selectIngredientForItem [invoices.tsx] — Picker
├── saveCanonicalIngredientFromInvoice [invoices.tsx] — Review & Create
├── saveBulkCanonicalIngredientsFromInvoice [invoices.tsx] — Bulk create
└── reassignCatalogReviewInvoiceLineMatch [catalog-review] — Catalog review

DEAD:
persistInvoiceLineAliasMemory [ingredient-match-alias-memory.ts] — 0 callers

IN-MEMORY ONLY (no DB):
recordInvoiceLineAliasMemory → autoPersistUnmatchedInvoiceItems

NOT IN GRAPH:
supabase/functions/**, invoice re-read, semantic matcher
```
