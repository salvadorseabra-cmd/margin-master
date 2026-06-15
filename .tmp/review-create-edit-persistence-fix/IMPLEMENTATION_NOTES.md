# Implementation Notes

**Date:** 2026-06-15

## Change

File: `src/components/bulk-canonical-ingredient-create-sheet.tsx`

### Added `mergeBulkCanonicalIngredientRows`

Pure function that maps refreshed `candidates` to row state while preserving existing rows by `itemId`:

- Existing rows keep `canonicalName`, `selected`, and `error`.
- New candidates get `initialRowState`.
- Removed candidates drop out (map is over current `candidates` only).

### Updated `useEffect`

```ts
useEffect(() => {
  if (!open) {
    setRows([]);
    return;
  }
  setRows((current) => mergeBulkCanonicalIngredientRows(current, candidates));
}, [open, candidates]);
```

- **Sheet opens:** `current` is `[]` → rows initialize from suggestions.
- **Candidates refresh while open:** edits preserved per `itemId`.
- **Sheet closes:** rows cleared for a clean next open.

## Why merge over open-only ref

Merge handles both edit preservation and late-arriving candidates without a second initialization path. Minimal surface area; exported for unit tests.

## Out of scope (per constraints)

No changes to schema, migrations, matching, pricing, canonical generation, or `invoices.tsx`.
