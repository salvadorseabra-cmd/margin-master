# Evidence Presentation Quality Pass

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Scope:** Evidence hover rows in `ValidationFindingRenderer` — labels, units, and extra-key formatting

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/invoice-validation/types.ts` | Added optional `label` on `ValidationEvidenceValue` |
| `src/lib/invoice-validation/present-evidence.ts` | **New** — evidence → `PresentedEvidenceRow[]` |
| `src/lib/invoice-validation/format-evidence-value.ts` | Currency/unit formatting (`€`, `€/kg`, `€/L`) |
| `src/lib/invoice-validation/humanize-evidence-key.ts` | Owner-friendly extra-key labels |
| `src/lib/invoice-validation/render-finding.tsx` | Delegates to `presentEvidence()` |
| `src/lib/invoice-validation/index.ts` | Re-exports `presentEvidence` |
| `src/lib/invoice-validation/validators/operational.ts` | Semantic labels + `EUR/kg` units |
| `src/lib/invoice-validation/validators/extraction.ts` | Labels on math/OCR/name evidence |
| `src/lib/invoice-validation/validators/matching.ts` | Label on unmatched-ingredient expected |

---

## Presentation architecture

```
ValidationEvidence (validators)
        ↓
presentEvidence()          ← labels, hidden keys, value formatting
        ↓
PresentedEvidenceRow[]     ← { label, value }
        ↓
ValidationEvidenceRenderer ← generic dl/grid, no finding.code switches
```

**Design principles**

1. Validators emit semantic `label` and correct `unit` where the meaning is domain-specific.
2. `presentEvidence()` applies generic fallbacks (EUR → Calculated/Invoice total; EUR/kg → operational cost).
3. Renderer stays a dumb row list — no per-code logic.
4. Internal keys (`check`, `field`, raw `usable_quantity`) are hidden or merged at presentation time.

### ValidationEvidence extension

```ts
export type ValidationEvidenceValue = {
  value: number | string;
  unit?: string;
  label?: string;  // optional human row label
};
```

No other model changes. `field` remains on evidence for finding identity but is not shown in hover UI.

---

## Evidence transformations

| Source | Before | After |
|--------|--------|-------|
| `expected` (operational) | Expected · 10.83 kg | Invoice operational cost · €10.83/kg |
| `actual` (operational) | Actual · 6.18 kg | Calculated operational cost · €6.18/kg |
| `expected` (math) | Expected · 11.42 EUR | Calculated total · €11.42 |
| `actual` (math) | Actual · 13.44 EUR | Invoice total · €13.44 |
| `difference.absolute` (EUR) | Difference · 2.02 | Amount off · €2.02 |
| `difference.percent` | Difference % · 15.03% | Percent off · 15.03% |
| `extra.check` | Check · pack_structure_vs_row_weight | *(hidden)* |
| `extra.structure_usable_kg` | Calculated usable quantity · 10.5 | Calculated usable quantity · 10.5 kg |
| `extra.purchased_weight_kg` | Purchased weight · 6 | Invoice quantity · 6 kg |
| `extra.pack_structure` | Pack structure · `{...JSON...}` | Pack structure · 7 un × 1.5 kg |
| `extra.line_total` | Line total · 64.93 | Invoice total · €64.93 |
| `expected` (OCR) | Expected · 12 | Quantity on PDF · 12 |
| `actual` (OCR) | Actual · 10 | Quantity on row · 10 |
| `expected` (missing qty) | Expected · present | *(skipped)* |
| `field` | Field · quantity | *(hidden)* |

### €/kg bug fix

Operational validators previously set `unit: "kg"` on price-per-kg values, rendering as weight. Units are now `EUR/kg` (or `EUR/L` for volume rows); `formatEvidenceValue` renders `€10.83/kg`.

---

## Examples

### Guanciale (`pack_structure_vs_row_weight`)

| Label | Value |
|-------|-------|
| Invoice operational cost | €10.83/kg |
| Calculated operational cost | €6.18/kg |
| Amount off | €4.65 |
| Percent off | 42.94% |
| Calculated usable quantity | 10.5 kg |
| Invoice quantity | 6 kg |
| Invoice total | €64.93 |
| Invoice unit | un |
| Pack structure | 7 un × 1.5 kg |

### Gorgonzola (`MATHEMATICAL_INCONSISTENCY`)

| Label | Value |
|-------|-------|
| Calculated total | €11.42 |
| Invoice total | €13.44 |
| Amount off | €2.02 |
| Percent off | 15.03% |
| Invoice quantity | 1.05 |
| Invoice unit price | €10.88 |

### OCR quantity mismatch

| Label | Value |
|-------|-------|
| Quantity on PDF | *(ocr value)* |
| Quantity on row | *(entered value)* |
| Percent off | *(delta %)* |

---

## Regression results

```bash
npm test -- src/lib/invoice-validation/
```

```
✓ src/lib/invoice-validation/invoice-validation.test.ts (7 tests)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

Badge titles/tones unchanged (`presentation.ts` untouched). Only hover evidence rows improved.

---

## Out of scope (future pass)

- Finding title/description copy changes (see `.tmp/validation-findings-ux-quality-pass/REPORT.md`)
- Variant-specific operational badge titles
- Deduplication of math findings on same row
