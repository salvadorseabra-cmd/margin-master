# ValidationFindingRenderer — Implementation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25

---

## Summary

Added a generic `ValidationFindingRenderer` that presents any `ValidationFinding` from structured data alone (no `finding.code` switches). Invoice Review badges are unchanged visually; hover now opens a Radix **HoverCard** with title, description, evidence rows, and suggested action instead of the browser-native `title` tooltip.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/invoice-validation/humanize-evidence-key.ts` | snake_case → readable labels; optional overrides for common evidence keys |
| `src/lib/invoice-validation/format-evidence-value.ts` | Generic scalar / evidence-value / difference formatting |
| `src/lib/invoice-validation/render-finding.tsx` | `ValidationFindingRenderer` + `ValidationEvidenceRenderer` |
| `src/components/validation-finding-badge.tsx` | Badge + HoverCard wrapper for review rows |

## Files Modified

| File | Change |
|------|--------|
| `src/routes/invoices.tsx` | Review badges use `ValidationFindingBadge` instead of `OperationalBadge` + `title` |
| `src/lib/invoice-validation/index.ts` | Export renderer, formatters, and `humanizeEvidenceKey` |

---

## Renderer Architecture

```
ValidationFinding
       │
       ▼
ValidationFindingRenderer          ← title, description, suggestedAction
       │
       ├── ValidationEvidenceRenderer (if evidence)
       │         │
       │         └── buildEvidenceRows() — fixed order, no code switches:
       │               1. Expected (value + unit)
       │               2. Actual (value + unit)
       │               3. Difference (absolute)
       │               4. Difference %
       │               5. Field
       │               6. extra[*] → humanizeEvidenceKey + formatEvidenceScalar
       │
       └── suggestedAction paragraph (if present)
```

**Rules enforced:**
- No `switch (finding.code)` anywhere in the presentation layer.
- Evidence keys humanized via `humanizeEvidenceKey()` (dictionary overrides + snake_case fallback).
- Objects in `extra` serialized with `JSON.stringify` (e.g. `pack_structure`).
- `validationFindingDescription()` used for description (falls back to deprecated `message`).

---

## Popover Implementation

- **Component library:** Radix UI via existing shadcn wrappers — `@/components/ui/hover-card` (`@radix-ui/react-hover-card`).
- **Why HoverCard over Popover/Tooltip:** HoverCard is the project's Radix primitive for rich content on hover. `Popover` is click-driven (used elsewhere for pickers); `Tooltip` is single-line text only.
- **`ValidationFindingBadge`:** Reuses the same badge CSS classes as `OperationalBadge` (tone from `validationFindingBadgeTone`). `openDelay={200}`, `closeDelay={100}`, `w-80` content panel, `align="start"`.
- **Scope:** Only `reviewBadges` in Invoice Review rows; inline chips (`OperationalBadge`) unchanged.

---

## Example Renderings

### Guanciale (operational)

**Badge:** `Operational mismatch` (amber review tone)

**Hover panel:**
- **Title:** Operational mismatch
- **Description:** Pack structure normalization does not reconcile with invoice weight economics.
- **Expected:** 10.83 kg
- **Actual:** 6.18 kg
- **Difference:** 4.65
- **Difference %:** 42.94%
- **Check:** pack_structure_vs_row_weight
- **Calculated usable quantity:** 10.5
- **Purchased weight:** 6
- **Line total:** 64.93
- **Quantity:** 5.996
- **Row unit:** un
- **Pack structure:** `{"container_count":7,"container_unit":"un",...}`
- **Usable quantity:** 10500
- **Usable quantity unit:** g
- **Suggested action:** Confirm whether row quantity is billed weight or whether pack notation should scale usable stock.

### Mathematical inconsistency (Gorgonzola)

**Badge:** `Math inconsistency` (amber review tone)

**Hover panel:**
- **Title:** Math inconsistency
- **Description:** Quantity × unit price does not reconcile with line total
- **Expected:** 30 EUR
- **Actual:** 35 EUR
- **Difference:** 5
- **Difference %:** 14.29%
- **Quantity:** 3
- **Unit price:** 10
- **Suggested action:** Correct quantity, unit price, or line total so the row reconciles.

### Missing quantity

**Badge:** `Quantity check`

**Hover panel:**
- **Title:** Quantity check
- **Description:** Quantity or unit is missing and could not be inferred from the line.
- **Expected:** present
- **Field:** quantity
- **Quantity:** —
- **Unit:** —
- **Suggested action:** Confirm quantity and unit from the invoice.

### Suggested match

**Badge:** `Suggested match` (muted tone)

**Hover panel:**
- **Title:** Suggested match
- **Description:** A possible ingredient match needs confirmation.
- **Field:** ingredient
- **Suggested ingredient:** Mozzarella Fior di Latte
- **Confidence:** high
- **Suggested action:** Confirm or change the suggested ingredient match.

*(Matching findings are not shown in review-row badges today — `reviewRowValidationFindings` filters to extraction/mathematics/operational only — but the renderer supports them for reuse by other consumers.)*

---

## Regression Results

```bash
npm test -- src/lib/invoice-validation/
```

| Result | Count |
|--------|------:|
| Test files passed | 1 |
| Tests passed | 7 |

All existing invoice-validation tests pass. Badge colours, labels, and layout unchanged; only hover interaction differs.
