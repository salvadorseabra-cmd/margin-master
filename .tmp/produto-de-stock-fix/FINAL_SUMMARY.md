# Final Summary — Produto de Stock Contamination Fix

**Date:** 2026-06-15

## Problem

Emporio Italia invoices print `Produto de Stock` in the Designação column. GPT extraction copied it into `items[].name` with no downstream strip, polluting canonical Review & Create suggestions.

## Solution

1. **Primary:** Deterministic trailing suffix strip in `cleanInvoiceItemDisplayName()` — fixes all consumers of `normalizeInvoiceItemFields` (invoice table, matching, Review & Create modal).
2. **Defense in depth:** Exact phrase `produto de stock` in normalization and canonical noise phrase lists.

## Files changed

- `src/lib/invoice-item-fields.ts`
- `src/lib/normalize-ingredient-name.ts`
- `src/lib/canonical-ingredient-display-name.ts`
- `src/lib/invoice-item-fields.test.ts`
- `src/lib/canonical-ingredient-create.test.ts`

## Cleanup rule

```regex
/[/\s-]*Produto de Stock\s*$/iu
```

Removes trailing `Produto de Stock` with optional leading whitespace, `/`, or `-` separators. Case-insensitive.

## Confirmation

- Review & Create receives `renderItem` from `normalizeInvoiceItemFields` — contamination stripped before suggestions.
- Canonical suggestions for all four audited Emporio examples are clean.
- 92 tests pass; no unintended `produto` stripping.
