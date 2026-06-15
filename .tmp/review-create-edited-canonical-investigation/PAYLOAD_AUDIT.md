# Payload Audit — What Gets Persisted on Create

**Date:** 2026-06-15

---

## Verdict

**`confirmedCanonicalName` from the input field** — not `suggestedCanonicalName` — when submit succeeds.

---

## Bulk sheet path

1. `initialRowState` sets `canonicalName: suggestion` (from `suggestedCanonicalName`)
2. User edits `row.canonicalName` in UI
3. `handleSubmit` maps `canonicalName: row.canonicalName.trim()` to submissions
4. `buildBulkSubmitValuesFromDefaults(candidate.defaults, submission.canonicalName)`
5. `buildExplicitCanonicalInsertPayload({ canonicalName: values.canonicalName })`
6. `buildCatalogIngredientIdentity(input.canonicalName)` — user string wins

Tests assert: "uses user canonical name, not invoice alias".

---

## Critical UI risk: state reset before submit

```tsx
useEffect(() => {
  if (!open) return;
  setRows(candidates.map(initialRowState));
}, [open, candidates]);
```

Whenever `candidates` **reference changes** while sheet is open, all edits reset to `suggestedCanonicalName`.

`candidates` recomputes when `items`, `ingredientCatalog`, or `confirmedIngredientAliases` change. Any parent refresh during editing can silently wipe edits.

**This is the prime suspect for persistence failure.**

---

## Validation

Edited shorter names should pass:
- `"Stracciatella"` ≠ normalized `"stracciatella 250 gr"` → OK
- `"Mezzi paccheri"` ≠ normalized invoice with `mancini` → OK
