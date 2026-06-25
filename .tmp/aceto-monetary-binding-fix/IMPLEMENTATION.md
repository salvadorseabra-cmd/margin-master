# Aceto Monetary Binding Fix — Implementation Report

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice item:** `1ccf0bd0-12ef-4823-b504-3833df0899c7`  
**Date:** 2026-06-25

---

## Root cause

Pass C extracted **Valor (line total) correctly** as €16.09 but did not reliably extract Mammafiore structured columns (`gross_unit_price`, `discount_pct`). Monetary binding then derived `unit_price = round2(wrong_gross × 0.85) = €15.55` when `discount_pct=15` was present with a misread gross (18.295 vs PDF 18.929). `applyEffectivePaidPrice` did not run because `total > qty × unit_price` (inverse of the gross-over-net pattern it handles).

**Classification:** B — extraction / monetary binding produced wrong net `unit_price` while `total` was correct.

---

## Fix

### 1. `invoice-monetary-binding.ts` — structured binding

**`applyStructuredBinding`:** When `quantity === 1` and `deriveNetUnitPrice(gross, discount)` drifts from `line_total_net` beyond tolerance, trust the printed Valor as `unit_price` instead of the mis-derived gross×discount net.

**`applyRuleF`:** When gross×discount×qty does not reconcile with `line_total_net` and `quantity === 1`, set `unit_price = line_total_net / qty` (i.e. the printed net unit). For `quantity > 1`, keep deriving net unit from gross+discount (Pomodor / multipack rows unchanged).

### 2. `invoice-table-extraction.ts` — Pass C prompt

Added **Aceto balsamico** as a Mammafiore positive example in the `MAMMAFIORE COLUMN ISOLATION` section and updated the `PRICE ACCURACY` example to require structured columns:

```
gross_unit_price: 18.929
discount_pct: 15
line_total_net: 16.09
quantity: 1
```

---

## Files modified

| File | Change |
|------|--------|
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | Qty-1 Valor trust in `applyStructuredBinding`; `applyRuleF` uses Valor for qty=1 |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | Aceto Mammafiore structured-column prompt examples |
| `supabase/functions/extract-invoice/invoice-monetary-binding.test.ts` | Aceto fix tests + Guanciale/Peroni/Gorgonzola regression |
| `src/lib/invoice-validation/invoice-validation.test.ts` | Aceto post-fix: no `MATHEMATICAL_INCONSISTENCY` |

**Not modified (per constraints):** mathematical validators, `ValidationFinding` architecture, thresholds, Invoice Review, `invoice-extraction-review.ts` gates.

---

## Before / after persisted values

| Field | Before (VL DB / v31 extract) | After (binding simulation) |
|-------|------------------------------|----------------------------|
| `quantity` | 1 | 1 |
| `unit_price` | **15.55** | **16.09** |
| `total` | 16.09 | 16.09 |
| `gross_unit_price` | *(not persisted)* | *(stripped at API — used only in pipeline)* |
| `discount_pct` | *(not extracted / not persisted)* | 15 *(when Pass C reads Desc.)* |

**Validation simulation** (`hasMathematicalInconsistency` / `validateInvoiceLine`):

| | Before | After |
|---|--------|-------|
| `expected_total` | 15.55 | 16.09 |
| `variance_abs` | 0.54 | 0.00 |
| `MATHEMATICAL_INCONSISTENCY` | **fires** (0.54 > €0.50 OR gate) | **does not fire** |

---

## Test results

### Deno — monetary binding + qty prepass

```bash
~/.deno/bin/deno test -A \
  supabase/functions/extract-invoice/invoice-monetary-binding.test.ts \
  supabase/functions/extract-invoice/invoice-qty-prepass.test.ts
```

**Result:** 34 passed, 0 failed

Key cases:
- Aceto structured `18.929 / 15% / 16.09` → `unit_price=16.09`
- Aceto wrong gross `18.295 / 15% / 16.09` → `unit_price=16.09` (Valor trust)
- Guanciale, Peroni, Gorgonzola, Mozzarella — unchanged
- Legacy-only Aceto (no structured fields) — unchanged at 15.55/16.09

### Vitest — validation / extraction review

```bash
npm test -- \
  src/lib/invoice-validation/invoice-validation.test.ts \
  src/lib/invoice-extraction-review.test.ts
```

**Result:** 18 passed, 0 failed

---

## Regressions

None observed in the above suites. Gorgonzola canonical triple (`1.05 × 10.88 ≠ 13.44`) still flags as before.

---

## VL re-ingest

**Required for live DB.** Tests simulate binding + validation on fixture inputs; they do not update `invoice_items` row `1ccf0bd0`. After deploy, re-ingest Mammafiore invoice `36c99d19-6f9f-413f-8c2d-ae3526291a2d` so persisted `unit_price` updates from 15.55 → 16.09 and the live `MATHEMATICAL_INCONSISTENCY` finding clears.
