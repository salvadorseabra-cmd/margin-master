# Validation Findings Engine — Implementation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25

---

## Summary

Introduced a unified `ValidationFinding` model and lightweight validation pipeline under `src/lib/invoice-validation/`. Existing invoice review guardrails were migrated without duplicating logic; Invoice Review now consumes findings for row highlighting and inline badges. Two new validators were added: mathematical inconsistency (OR threshold, error) and operational normalization inconsistency (warning).

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/invoice-validation/types.ts` | `ValidationFinding` model and `InvoiceLineValidationInput` |
| `src/lib/invoice-validation/finding-id.ts` | Deterministic finding ID builder |
| `src/lib/invoice-validation/validators/extraction.ts` | Migrated extraction review rules |
| `src/lib/invoice-validation/validators/mathematics.ts` | New mathematical inconsistency rule |
| `src/lib/invoice-validation/validators/operational.ts` | New operational normalization rule |
| `src/lib/invoice-validation/validators/matching.ts` | Migrated matching signals |
| `src/lib/invoice-validation/engine.ts` | Pipeline orchestrator |
| `src/lib/invoice-validation/presentation.ts` | Badge label/tone mapping for UI |
| `src/lib/invoice-validation/index.ts` | Public exports |
| `src/lib/invoice-validation/invoice-validation.test.ts` | Unit tests (Gorgonzola, Guanciale, regressions) |

---

## Files Modified

| File | Change |
|------|--------|
| `src/routes/invoices.tsx` | Invoice Review consumes `validateInvoiceLine()` findings for row review state and inline badges |

---

## ValidationFinding Model

```ts
type ValidationFinding = {
  id: string
  severity: "info" | "warning" | "error"
  category: "extraction" | "mathematics" | "operational" | "matching" | "supplier"
  code: string
  invoiceItemId?: string
  field?: string
  title: string
  message: string
  evidence?: Record<string, unknown>
  suggestedAction?: string
}
```

Finding IDs are deterministic: `{invoiceItemId}:{code}` (optional `:{field}`).

---

## Validation Engine Architecture

```
InvoiceLineValidationInput
  → validateExtractionFindings()   // extraction + migrated math (AND) + OCR
  → validateMathematicsFindings()  // new math inconsistency (OR)
  → validateOperationalFindings()  // new operational economics
  → validateMatchingFindings()     // unmatched / suggested match
  → ValidationFinding[] (deduped by id)
```

Entry points:

- `validateInvoiceLine(input)` — single row
- `validateInvoiceLines(inputs)` — batch
- `lineNeedsExtractionReview(findings)` — amber row + header badge (extraction, mathematics, operational; excludes info-level matching)

Validators are pure functions: no UI coupling, no persistence side effects.

---

## Existing Validations Migrated

| Previous source | Finding code | Category | Severity |
|-----------------|--------------|----------|----------|
| `isPlaceholderItemName` (invoices.tsx) | `PLACEHOLDER_ITEM_NAME` | extraction | warning |
| `needsQuantityUnitConfirmation` | `MISSING_QUANTITY_UNIT` | extraction | warning |
| `needsAmountConfirmation` | `MISSING_AMOUNT` | extraction | warning |
| `deriveMathematicalReconciliationReviewReason` | `MATHEMATICAL_RECONCILIATION_FAILURE` | mathematics | warning |
| `deriveOcrQtyMismatchReviewReason` | `OCR_QUANTITY_MISMATCH` | extraction | warning |
| Unmatched ingredient display state | `UNMATCHED_INGREDIENT` | matching | warning |
| Suggested match display state | `SUGGESTED_INGREDIENT_MATCH` | matching | info |

Migrated rules call the same underlying functions in `invoice-extraction-review.ts` and row match state — no duplicated threshold logic.

---

## New Findings Implemented

### 1. Mathematical inconsistency (`MATHEMATICAL_INCONSISTENCY`)

- **Category:** mathematics  
- **Severity:** error  
- **Gate:** `variance_abs > €0.50` **OR** `variance_pct > 5%` (vs legacy AND gate)  
- **Reuses:** `computeMathematicalReconciliation()` from `invoice-extraction-review.ts`  
- **Catches:** Gorgonzola canonical (15.03%) and re-extracted (4.46% / €0.60 gap)

### 2. Operational normalization inconsistency (`OPERATIONAL_NORMALIZATION_INCONSISTENCY`)

- **Category:** operational  
- **Severity:** warning  
- **Checks (in order):**
  1. Display-path: invoice-implied unit cost vs `computeEffectiveUsableCost` (via `resolveStructuredPurchaseForDisplay`)
  2. Pack-structure: name-derived usable at qty=1 vs fractional generic-row weight economics (Guanciale `*7` pattern)
- **Catches:** Guanciale when pack notation total (10.5 kg) diverges from billed row weight (~6 kg)

---

## UI Integration

`ItemsTable` in `invoices.tsx`:

1. Builds `InvoiceLineValidationInput` per row (includes OCR meta, match state, matched ingredient name).
2. Calls `validateInvoiceLine()` once per row.
3. `lineNeedsExtractionReview()` drives amber row background and header “Needs review” count.
4. `reviewRowValidationFindings()` + `validationFindingBadgeLabel/Tone/Title` render inline badges (replacing direct math/OCR badge wiring).
5. Ingredient match chips and price-spike signals remain via `deriveInvoiceRowInlineChips` (unchanged).

---

## Regression Testing Results

```bash
npm test -- src/lib/invoice-validation/invoice-validation.test.ts src/lib/invoice-extraction-review.test.ts
```

| Result | Count |
|--------|------:|
| Test files passed | 2 |
| Tests passed | 17 |

### VL Corpus Verification (unit replay)

| Case | Mathematical finding | Operational finding | Evidence |
|------|:-------------------:|:-------------------:|----------|
| **Gorgonzola** (1.05 × 10.88 vs 13.44) | **Yes** — `MATHEMATICAL_INCONSISTENCY` error + migrated `MATHEMATICAL_RECONCILIATION_FAILURE` warning | No (kg short-circuit; math covers) | `invoice-validation.test.ts` |
| **Gorgonzola** re-extracted (1.30 × 9.88 vs 13.44) | **Yes** — new OR rule; legacy AND rule passes | No | `invoice-validation.test.ts` |
| **Guanciale** (5.996 un / €64.93) | No (row math correct) | **Yes** — pack structure 10.5 kg vs 5.996 kg billed weight | `invoice-validation.test.ts` |

**Note:** Stock normalization for Guanciale row qty was partially fixed upstream (`row_weight_billed` → 5996 g). The operational validator uses a pack-structure vs row-weight check so the economics bug still surfaces when name notation implies a different usable mass than the billed quantity.

---

## Decisions

1. **Preserve legacy math gate** — migrated `MATHEMATICAL_RECONCILIATION_FAILURE` keeps AND threshold; new `MATHEMATICAL_INCONSISTENCY` adds OR gate without changing `invoice-extraction-review.ts`.
2. **Operational dual check** — display-path mismatch plus pack-structure vs row-weight for Guanciale-class bugs when per-row normalization rescale masks the error.
3. **Matching findings** — produced by engine but not shown as extraction review badges (match chips unchanged).
4. **No `extraction_meta` persistence** — out of scope; OCR mismatch remains session-only.

---

## Not Implemented (per spec)

Historical pricing, supplier, VAT, discount, duplicate invoices, OCR confidence, yield, waste, recipe validation, `extraction_meta` DB persistence.
