# Guanciale Resolution — Normalization + Validation Alignment

**VL:** `bjhnlrgodcqoyzddbpbd`  
**Pre-change commit:** `daf721c` (working tree was clean; no new commit needed before edits)  
**Date:** 2026-06-25

---

## Summary

Operational normalization for Guanciale-class `size_count` kg rows was already correct via `shouldUseRowQtyAsBilledKgForSizeCountGenericRow` in `computeUsableFromPurchaseStructure`. The remaining bug was in operational **validation**: `detectPackStructureInvoiceWeightMismatch` re-parsed at `quantity: 1`, bypassing billed-kg policy and producing a false `pack_structure_vs_row_weight` finding.

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/invoice-validation/validators/operational.ts` | Align pack-structure check with final normalized usable at actual row qty; use `computeEffectiveUsableCost` for economics |
| `src/lib/invoice-validation/invoice-validation.test.ts` | Guanciale test expects no operational finding; `lineNeedsExtractionReview` uses Gorgonzola |

**Not modified (per constraints):** OCR, package parsing, ValidationFinding architecture, Invoice Review UI, `stock-normalization.ts` (Phase 1 guard already present at lines 1401–1404).

---

## Phase 1 — Operational normalization

**Status:** Already implemented in `daf721c`.

`computeUsableFromPurchaseStructure()` applies `shouldUseRowQtyAsBilledKgForSizeCountGenericRow()` at line 1401, **before** the `structureTotalIsFinalForGenericRow()` branch at line 1412.

Guanciale path:
```
parsePurchaseStructureFromText → 7×1.5 kg = 10 500 g (parser correct)
→ shouldUseRowQtyAsBilledKgForSizeCountGenericRow(5.996, un) → true
→ usableSource: row_weight_billed, usableQuantity: 5996 g
```

---

## Phase 2 — Operational validation alignment

### Before

`detectPackStructureInvoiceWeightMismatch`:
1. Called `resolveStructuredPurchaseForDisplay({ ...metadata, quantity: 1 })`
2. Compared name-derived structure total (10.5 kg) vs billed row qty (5.996 kg)
3. Used synthetic `total / structureKg` (€6.18/kg) instead of `computeEffectiveUsableCost`

### After

1. Calls `resolveStructuredPurchaseForDisplay(metadata)` with **actual** row quantity
2. Compares **final** `normalizedUsableQuantity` (5996 g → 5.996 kg) vs billed row qty
3. Uses `computeEffectiveUsableCost` for economics comparison (same path as Operational Cost / Ingredient Detail)
4. Removed `quantity: 1` override

---

## Guanciale before / after

| Metric | Before | After |
|--------|--------|-------|
| Usable quantity | 5996 g (normalization) / 10500 g (validator qty=1 path) | 5996 g (both paths) |
| Operational cost | €10.83/kg (display) / €6.18/kg (validator) | €10.83/kg |
| Validation finding | `OPERATIONAL_NORMALIZATION_INCONSISTENCY` (`pack_structure_vs_row_weight`) | **None** |

---

## Validation finding status

**Disappeared.** `validateInvoiceLine(GUANCIALE)` returns `[]` after fix.

---

## Regression test results

```bash
npm test -- src/lib/invoice-validation/ src/lib/stock-normalization src/lib/invoice-purchase-price-semantics.test.ts
```

| Suite | Result |
|-------|--------|
| `stock-normalization.test.ts` | 119 passed |
| `invoice-validation.test.ts` | 7 passed |
| `invoice-purchase-price-semantics.test.ts` | 64 passed |
| **Total** | **190 passed, 0 failed** |

### Spot checks

| Product | Usable | Op cost | Finding |
|---------|--------|---------|---------|
| Guanciale | 5996 g | €10.83/kg | None |
| Peroni | 7920 ml | unchanged | None |
| Mozzarella Julienne | unchanged | unchanged | None |
| Aceto | unchanged | unchanged | Math only (unchanged) |
| Gorgonzola canonical | unchanged | unchanged | Math error (unchanged) |

---

## Parser untouched confirmation

- `parsePurchaseStructureFromText`, `SIZE_COUNT_RE`, `buildStructure` — **not modified**
- `1,5kg*7` still correctly parses as 7×1.5 kg = 10 500 g name structure
- Billed-kg semantics applied only in normalization policy (`shouldUseRowQtyAsBilledKgForSizeCountGenericRow`), not parser exceptions

---

## Regressions

None observed across 190 tests.
