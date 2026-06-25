# Validation Findings UX Polish — Final Pass

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Scope:** Presentation layer only — no validators, thresholds, types architecture, or invoice layout redesign

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/invoice-validation/finding-copy.ts` | **New** — owner-facing title/description/action overrides keyed by `finding.code` |
| `src/lib/invoice-validation/presentation.ts` | Badge label/description/action now route through `presentFindingCopy()` |
| `src/lib/invoice-validation/present-evidence.ts` | `section` + `emphasis` on each row; `groupPresentedEvidence()` helper |
| `src/lib/invoice-validation/render-finding.tsx` | Sectioned hover card (Problem / Why / Details / Suggested review) with typography emphasis |
| `src/lib/invoice-validation/humanize-evidence-key.ts` | Friendlier labels for `structure_usable_kg`, `invoice_implied_cost` |
| `src/lib/invoice-validation/index.ts` | Re-exports for new presentation APIs |
| `src/components/validation-finding-badge.tsx` | Slightly increased hover card padding |
| `src/routes/invoices.tsx` | Status chips and validation findings on separate rows with clearer spacing |

**Not modified:** `src/lib/invoice-validation/validators/*`, `types.ts`, thresholds, validation behaviour

---

## Approach

### 1. Wording overrides (`finding-copy.ts`)

Validators continue emitting engineering titles/descriptions. At render time, `presentFindingCopy(finding)` returns owner language:

- Looks up `COPY_BY_CODE[finding.code]` for static overrides
- Uses evidence-aware functions for math (€/pct in description), OCR (PDF vs row qty), and operational variants (`evidence.extra.check`)
- Falls back to validator output for unmapped codes (e.g. `SUGGESTED_INGREDIENT_MATCH`)

`presentation.ts` exposes this to badges and hover cards — validators untouched.

### 2. Evidence hierarchy (`present-evidence.ts`)

Each `PresentedEvidenceRow` gets metadata from row **type**, not `finding.code`:

| Section | Rows | Emphasis |
|---------|------|----------|
| `problem` | `expected`, `actual`, `difference` | `medium` / `strong` for deltas |
| `why` | Supporting extras (weight, pack structure, qty, unit price, line total, item name, …) | `normal` |
| `detail` | Secondary extras (row unit, confidence, suggested ingredient, …) | `muted` |

Internal keys (`check`, `field`, raw `usable_quantity`) remain hidden.

`render-finding.tsx` groups rows generically via `groupPresentedEvidence()` — no per-code switches in the renderer.

### 3. Visual emphasis

- Problem values: `font-medium` / `font-semibold` on expected, actual, and difference
- Why rows: standard foreground
- Details: muted label and value
- Section headers: small caps labels (`Problem`, `Why`, `Details`, `Suggested review`)
- Badge tones unchanged (existing amber/muted palette)

### 4. Status vs findings (`invoices.tsx`)

Inline status chips (`Matched automatically`, `New supplier`, price warnings) render in the first row; validation finding badges render in a second row with `gap-1.5`. No table/layout redesign.

---

## Before / after examples

### Guanciale — `OPERATIONAL_NORMALIZATION_INCONSISTENCY`

| | Before | After |
|---|--------|-------|
| **Badge** | Operational mismatch | **Review pack interpretation** |
| **Description** | Pack structure normalization does not reconcile with invoice weight economics. | **The weight in the product name (~10.5 kg) doesn't match the billed quantity (6 kg), so the per-kg price looks wrong.** |
| **Suggested action** | Confirm whether row quantity is billed weight or whether pack notation should scale usable stock. | **Check the invoice: is this line priced by total weight billed, or by number of packs? Update quantity or pack size accordingly.** |

**Hover card structure (after)**

```
Problem
  Invoice operational cost     €10.83/kg
  Calculated operational cost  €6.18/kg
  Amount off                   €4.65
  Percent off                  42.94%

Why
  Weight from product name     10.5 kg
  Invoice quantity             6 kg
  Invoice total                €64.93
  Pack structure               7 un × 1.5 kg

Details
  Invoice unit                 un

Suggested review
  Check the invoice: is this line priced by total weight billed…
```

### Aceto — `MATHEMATICAL_INCONSISTENCY`

| | Before | After |
|---|--------|-------|
| **Badge** | Math inconsistency | **Review invoice mathematics** |
| **Description** | Quantity × unit price does not reconcile with line total | **Quantity × unit price doesn't match the line total — the numbers on this row don't add up.** |
| **Suggested action** | Correct quantity, unit price, or line total so the row reconciles. | **Fix quantity, unit price, or line total to match the invoice.** |

**Hover card structure (after)**

```
Problem
  Calculated total    €15.55
  Invoice total       €16.09
  Amount off          €0.54
  Percent off         3.36%

Why
  Invoice quantity    1
  Invoice unit price  €15.55

Suggested review
  Fix quantity, unit price, or line total to match the invoice.
```

---

## Copy mapping summary

| Code | Badge label |
|------|-------------|
| `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | Review pack interpretation |
| `MATHEMATICAL_INCONSISTENCY` | Review invoice mathematics |
| `MATHEMATICAL_RECONCILIATION_FAILURE` | Review invoice math |
| `OCR_QUANTITY_MISMATCH` | Review quantity |
| `MISSING_AMOUNT` | Missing invoice value |
| `UNMATCHED_INGREDIENT` | Ingredient not linked |

---

## Regression

```bash
npm test -- src/lib/invoice-validation/
```

```
✓ src/lib/invoice-validation/invoice-validation.test.ts (7 tests)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

- Validation behaviour unchanged (same codes fire for same rows)
- `ValidationFindingRenderer` has no `finding.code` switches
- Validator output preserved in finding objects; presentation overrides at read time only
