# Validation Findings Micro UX Pass

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Scope:** Presentation layer only — no validators, types, thresholds, or badge behaviour changes

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/invoice-validation/present-evidence.ts` | Merged difference rows; `ComparisonTone` semantics; WHY sort order; label normalization (`Invoice operational cost` → `Expected operational cost`) |
| `src/lib/invoice-validation/render-finding.tsx` | Vertical Problem comparison with ↓ arrows; semantic colour on comparison values |
| `src/lib/invoice-validation/finding-copy.ts` | Concise package + math descriptions |
| `src/lib/invoice-validation/humanize-evidence-key.ts` | `Detected package` / `Detected package weight` labels |
| `src/lib/invoice-validation/index.ts` | Export `ComparisonTone` |

**Not modified:** `src/lib/invoice-validation/validators/*`, `types.ts`, `validation-finding-badge.tsx`, `invoices.tsx`

---

## Before / after

### Problem section layout

**Before** — flat two-column list:

```
Problem
  Invoice operational cost     €10.83/kg
  Calculated operational cost  €6.18/kg
  Amount off                   €4.65
  Percent off                  42.94%
```

**After** — vertical comparison with ↓ arrows and merged difference:

```
Problem
  Expected operational cost
  €10.83/kg                    (green, medium)
        ↓
  Calculated operational cost
  €6.18/kg                     (red, semibold)
        ↓
  Difference
  €4.65 (42.94%)               (orange, bold)
```

### WHY section ordering (Guanciale)

**Before:**

```
Why
  Weight from product name     10.5 kg
  Invoice quantity             6 kg
  Invoice total                €64.93
  Pack structure               7 un × 1.5 kg
```

**After:**

```
Why
  Invoice quantity             6 kg
  Detected package             7 un × 1.5 kg
  Detected package weight      10.5 kg
  Invoice total                €64.93
```

### First explanatory sentence

| Finding | Before | After |
|---------|--------|-------|
| Guanciale (pack) | The weight in the product name (~10.5 kg) doesn't match the billed quantity (6 kg), so the per-kg price looks wrong. | **The detected package size doesn't match the billed quantity. This affects the calculated cost per kg.** |
| Aceto (math) | Quantity × unit price doesn't match the line total — the numbers on this row don't add up. | **The quantity, unit price and invoice total don't add up.** |

---

## Colour semantics (Problem section values only)

| Tone | Tailwind classes | Used for |
|------|------------------|----------|
| `invoice` | `font-medium text-green-600 dark:text-green-500` | Expected operational cost, Invoice total |
| `calculated` | `font-semibold text-red-600 dark:text-red-500` | Calculated operational cost, Calculated total |
| `difference` | `font-bold text-orange-600 dark:text-orange-500` | Combined difference row |

Labels in Problem stay muted (`text-muted-foreground`). Why and Details use default/muted emphasis — no semantic colours.

Tone is inferred from evidence value labels and units in `present-evidence.ts` — no `finding.code` switches in the renderer.

---

## Evidence ordering

### Problem (fixed pipeline)

1. Expected (invoice-side value)
2. Actual (calculated value)
3. Difference (absolute + percent merged when both exist)

### WHY (`WHY_KEY_SORT_ORDER` in `present-evidence.ts`)

| Order | Keys | Label |
|-------|------|-------|
| 1 | `quantity`, `purchased_weight_kg`, `ocr_quantity`, `pass_c_quantity` | Invoice quantity |
| 2 | `pack_structure` | Detected package |
| 3 | `structure_usable_kg` | Detected package weight |
| 4 | `line_total`, `total` | Invoice total |
| 5+ | `unit_price`, `invoice_implied_cost`, `item_name`, … | Supporting context |

---

## Typography

| Section | Labels | Values |
|---------|--------|--------|
| Problem | `text-[11px] text-muted-foreground` | Semantic colours above |
| Why | `text-muted-foreground` / `text-foreground` (default emphasis) | Standard foreground |
| Details | Muted label + value | `text-muted-foreground/70` / `/80` |
| Section headers | `text-[10px] font-semibold uppercase tracking-wide text-muted-foreground` | — |

---

## Comparison labels (presentation fallbacks)

| Context | Expected role | Actual role |
|---------|---------------|-------------|
| EUR/kg operational | Expected operational cost | Calculated operational cost |
| EUR totals | Calculated total | Invoice total |
| WHY extras | Detected package, Detected package weight, Invoice quantity | — |

Validator-provided `Invoice operational cost` is normalized to `Expected operational cost` at presentation time.

---

## Renderer architecture

```
ValidationFinding
  → presentFindingCopy()     (finding-copy.ts — code-keyed descriptions)
  → presentEvidence()        (generic evidence → PresentedEvidenceRow[])
  → groupPresentedEvidence() (problem / why / detail)
  → ValidationFindingRenderer (ProblemComparisonBlock + flat Why/Details)
```

No `finding.code` switches in `render-finding.tsx`.

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

Validation behaviour unchanged — same codes, severities, and evidence payloads from validators.
