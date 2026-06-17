# Implementation Notes — Produto de Stock Fix

**Date:** 2026-06-15

## Primary fix (`invoice-item-fields.ts`)

Added `INVOICE_PRODUTO_DE_STOCK_SUFFIX_RE` and applied it in `cleanInvoiceItemDisplayName()` before final whitespace collapse.

```typescript
const INVOICE_PRODUTO_DE_STOCK_SUFFIX_RE = /[/\s-]*Produto de Stock\s*$/iu;
```

Strips trailing Emporio Italia boilerplate when separated by optional whitespace, `/`, or `-`. Case-insensitive. Runs inside `normalizeInvoiceItemFields`, which is the pipeline used by invoice render, matching, and Review & Create (`renderItem`).

## Defense in depth

Added exact phrase `"produto de stock"` to:

- `normalize-ingredient-name.ts` → `COMMERCIAL_PHRASES`
- `canonical-ingredient-display-name.ts` → `CATALOG_NOISE_PHRASES`

Word-boundary phrase removal only — does not strip standalone `produto`.

## Scope respected

No schema, migrations, matching, pricing, purchase unit, recipe, or architecture changes.
