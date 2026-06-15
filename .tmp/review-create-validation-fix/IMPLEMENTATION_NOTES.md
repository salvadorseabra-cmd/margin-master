# Implementation Notes — Review & Create Validation Blocker Fix

## Change

**File:** `src/lib/canonical-ingredient-operational-name.ts`  
**Function:** `looksLikeSupplierAbbreviatedCatalogName`

### Before

The function re-checked `looksLikeInvoiceShorthandName(trimmed.toUpperCase())` unconditionally. Title-cased Phase 2 cleaned names (e.g. `"Pêra abacate"`) were uppercased to `"PÊRA ABACATE"`, where short tokens like `PÊRA` and `OVO` triggered the invoice-shorthand heuristic.

### After

Gate the `.toUpperCase()` re-check behind the same shouty-text threshold (`upperRatio >= 0.82`) used elsewhere:

```ts
const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
const upperRatio =
  letters.length > 0 ? (trimmed.match(/[A-Z]/g) ?? []).length / letters.length : 0;

if (looksLikeInvoiceShorthandName(trimmed)) return true;
if (upperRatio >= 0.82 && looksLikeInvoiceShorthandName(trimmed.toUpperCase())) return true;
```

## Why this is sufficient

- `shouldBlockCanonicalNameOnCreate` delegates to `looksLikeSupplierAbbreviatedCatalogName` (and direct `looksLikeInvoiceShorthandName`).
- `validateCanonicalIngredientName` calls `shouldBlockCanonicalNameOnCreate`.
- `persistIngredientFromInvoiceItem` also calls `shouldBlockCanonicalNameOnCreate`.

One function change fixes all create/validate paths.

## Scope

Validation layer only. No schema, migrations, matching, pricing, or suggestion-generation changes.
