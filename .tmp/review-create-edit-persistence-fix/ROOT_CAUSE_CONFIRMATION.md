# Root Cause Confirmation

**Date:** 2026-06-15

## Confirmed

The investigation in `.tmp/review-create-edited-canonical-investigation/` is correct.

`BulkCanonicalIngredientCreateSheet` had:

```ts
useEffect(() => {
  if (!open) return;
  setRows(candidates.map(initialRowState));
}, [open, candidates]);
```

Whenever the parent re-rendered and produced a new `candidates` array reference (catalog refresh, match recalculation, state updates in `invoices.tsx`), row state was fully reset to suggestion defaults. User edits to `canonicalName` were lost before submit.

## Not the cause

- Save pipeline (`buildBulkSubmitValuesFromDefaults` → `saveCanonicalIngredientFromInvoiceRow` → `buildExplicitCanonicalInsertPayload` → `persistIngredientFromInvoiceItem`) correctly uses `submission.canonicalName` when it receives it.
- Post-create matching does not rewrite `ingredients.name`.

## Fix target

`src/components/bulk-canonical-ingredient-create-sheet.tsx` only.
