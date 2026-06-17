# Code Path Trace — Invoice Review vs Review & Create

**Date:** 2026-06-15

## Invoice Review ("No Match")

```
invoice_items (Recargo persisted)
  → resolveInvoiceTableRowIngredientMatch → null
  → displayState: "unmatched" → "No match" chip
  → operationalSummary.unmatchedIngredients += 1
  → Create ingredient button available (validation blocks on submit)
```

**No `isNonFoodInvoiceLine` check in matching or display path.**

## Review & Create (excluded)

```
items → normalizeInvoiceItemFields
  → isEligibleInvoiceIngredientRow (Recargo passes)
  → isEligibleForExplicitCanonicalCreate
  → isNonFoodInvoiceLine → FALSE → EXCLUDED
```

Banner only shows when `bulkCreateCandidates.length > 0`.

## Where isNonFoodInvoiceLine is called

| Location | Effect |
|----------|--------|
| `isEligibleForExplicitCanonicalCreate` | Excluded from Review & Create |
| `buildCanonicalIngredientCreateDefaults` | `suggestedCanonicalName: null` |
| `validateCanonicalIngredientName` | Rejects with non-food message |
