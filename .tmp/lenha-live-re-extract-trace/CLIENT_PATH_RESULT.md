# Client Path Result — Lenha Re-Extract

**Date:** 2026-06-15

## Input (live edge function response)

```json
{ "items": [], "total": 75, "supplier": "Mais Lenhas & Carvão, Unipessoal, Lda." }
```

## Client simulation

| Step | Result |
|------|--------|
| `rawItemsCount` | 0 |
| `normalizeInvoiceItemFields` | N/A — no items |
| `shouldRejectInvoiceIngredientRow` | N/A |
| **`normalizedItems.length`** | **0** |
| `rejectedCount` | 0 |

## Abort location

**File:** `src/routes/invoices.tsx`  
**Function:** `runExtraction`  
**Lines:** 1417–1424

```ts
if (normalizedItems.length === 0) {
  // toast: "Extraction returned no line items — existing rows kept"
  return null;
}
```

Failure occurs **after** edge function returns empty items — not due to client-side filtering.
