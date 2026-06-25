# ValidationFinding Model v2 — Implementation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25

---

## Summary

Standardized `ValidationFinding` and `ValidationEvidence` so every validator emits a predictable structure (`expected` / `actual` / `difference` / `extra`). Replaced `message` with `description`; UI badges now use `title` (label) and `description` (tooltip `title` attribute). Validation behaviour and thresholds unchanged.

---

## Files Modified

| File | Change |
|------|--------|
| `src/lib/invoice-validation/types.ts` | Added `ValidationEvidence`; `description` replaces `message`; optional deprecated `message` |
| `src/lib/invoice-validation/finding-id.ts` | `field` merged into `evidence.field` at build time |
| `src/lib/invoice-validation/presentation.ts` | Badge label = `title`, tooltip = `description`; added `validationFindingDescription()` |
| `src/lib/invoice-validation/index.ts` | Export `ValidationEvidence`, `validationFindingDescription` |
| `src/lib/invoice-validation/validators/extraction.ts` | Standardized evidence for all extraction/math/OCR findings |
| `src/lib/invoice-validation/validators/mathematics.ts` | Standardized math inconsistency evidence |
| `src/lib/invoice-validation/validators/operational.ts` | Standardized operational evidence with pack structure in `extra` |
| `src/lib/invoice-validation/validators/matching.ts` | Evidence for unmatched/suggested match |
| `src/lib/invoice-validation/invoice-validation.test.ts` | Updated Guanciale evidence assertions |
| `src/routes/invoices.tsx` | Pass `suggestedIngredientName` / `matchConfidence` into validation input |

---

## ValidationEvidence Model

```ts
type ValidationEvidenceValue = {
  value: number | string;
  unit?: string;
};

type ValidationEvidence = {
  field?: string;
  expected?: ValidationEvidenceValue;
  actual?: ValidationEvidenceValue;
  difference?: { absolute?: number; percent?: number };
  extra?: Record<string, unknown>;
};
```

---

## ValidationFinding Model

```ts
type ValidationFinding = {
  id: string;
  severity: "info" | "warning" | "error";
  category: "extraction" | "mathematics" | "operational" | "matching" | "supplier";
  code: string;
  title: string;           // badge label
  description: string;     // tooltip explanation (replaces message)
  invoiceItemId?: string;
  evidence?: ValidationEvidence;
  suggestedAction?: string;
  message?: string;        // @deprecated — use description
};
```

Top-level `field` removed from the public model; `buildValidationFinding({ field })` still accepts `field` and merges it into `evidence.field` for stable finding IDs.

---

## Validators Migrated

| Code | Category | Evidence shape |
|------|----------|----------------|
| `PLACEHOLDER_ITEM_NAME` | extraction | `field: name`, expected product name vs actual extracted |
| `MISSING_QUANTITY_UNIT` | extraction | `field: quantity`, expected present; `extra`: quantity/unit |
| `MISSING_AMOUNT` | extraction | `field: unit_price`, expected present; `extra`: unit_price/total |
| `MATHEMATICAL_RECONCILIATION_FAILURE` | mathematics | expected/actual EUR totals, difference abs/%, extra qty/unit_price |
| `OCR_QUANTITY_MISMATCH` | extraction | expected OCR qty, actual Pass C qty, difference % |
| `MATHEMATICAL_INCONSISTENCY` | mathematics | same as math reconciliation |
| `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | operational | expected invoice-implied unit cost, actual operational cost, difference; extra: check variant, pack_structure, usable_quantity |
| `UNMATCHED_INGREDIENT` | matching | expected catalog match; extra: item_name |
| `SUGGESTED_INGREDIENT_MATCH` | matching | extra: suggested_ingredient, confidence |

Shared helpers: `mathReconciliationEvidence()`, `ocrQuantityEvidence()` in `validators/extraction.ts`.

---

## Backwards Compatibility

- `message` is optional on `ValidationFinding` and populated only if callers pass it to `buildValidationFinding` (validators now use `description` only).
- `validationFindingDescription()` and `validationFindingBadgeTitle()` fall back to `message` when `description` is absent.
- `buildValidationFinding({ field })` still works — field is folded into `evidence.field`.
- Finding IDs unchanged (`{invoiceItemId}:{code}` or `:{field}` suffix).
- `InvoiceLineValidationInput` extended with optional `suggestedIngredientName` and `matchConfidence` (non-breaking).

---

## Test Results

```bash
npm test -- src/lib/invoice-validation/invoice-validation.test.ts src/lib/invoice-extraction-review.test.ts
```

| Result | Count |
|--------|------:|
| Test files passed | 2 |
| Tests passed | 17 |

Verified: Guanciale operational finding (`expected` 10.83 vs `actual` 6.18), Gorgonzola mathematical inconsistencies, migrated AND-threshold math review, operational row review flag.

---

## Remaining Work Before Rich Badge Tooltips

1. **Tooltip component** — render structured `evidence` (expected/actual/difference) and `suggestedAction` in a popover, not just `description` on `title`.
2. **Missing quantity `actual: null`** — spec allows null actual; current model uses `expected: "present"` without `actual` (use `extra` for raw values). Consider a typed sentinel if tooltips need explicit null display.
3. **Operational display-path findings** — no VL corpus unit test yet for `display_operational_vs_invoice` variant.
4. **Batch summary path** — header `extractionReview` count in `invoices.tsx` does not pass match confidence (matching findings excluded from review badges anyway).
5. **Remove deprecated `message`** — after all consumers migrate to `description`.
6. **i18n** — `title` / `description` / `suggestedAction` are English literals today.
