# Outer Quantity Scaling Family — Implementation Validation

Generated: 2026-06-23T09:08:42.094Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: **POST-IMPLEMENTATION**

## Verdict: **A) Safe to merge**

## Changed Files

- `src/lib/stock-normalization.ts`
- `src/lib/stock-normalization.test.ts`

## Before/After — Family Summary

| Status | Before | After |
|--------|--------|-------|
| SAFE | 11 | 17 |
| BROKEN | 6 | 0 |
| SUSPICIOUS | 8 | 8 |

## Before/After — Focus Products

| Product | RowQty | Before Usable | After Usable | Expected | Before Status | After Status |
|---------|--------|---------------|--------------|----------|---------------|--------------|
| Chocolate Culinaria Pantagruel 10x200 g | 2 | 2 kg | 4 kg | 4 kg | BROKEN | SAFE |
| Nata Culinaria 22% Reny Picot 6x1 Lt | 5 | 6.00 L | 30.00 L | 30.00 L | BROKEN | SAFE |
| Chocolate Pantagruel 10x200g | 2 | 2 kg | 4 kg | 4 kg | BROKEN | SAFE |
| Nata Reny Picot 22% 6x1L | 5 | 6.00 L | 30.00 L | 30.00 L | BROKEN | SAFE |
| SanPellegrino - Acqua in vitro 75cl x 15ud | 2 | 11.25 L | 22.50 L | 22.50 L | BROKEN | SAFE |
| Baladin - Ginger Beer 0.20cl | 24 | 4.80 L | 4.80 L | 4.80 L | SAFE | SAFE |
| MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 | 10 | 10 kg | 10 kg | 10 kg | SAFE | SAFE |
| Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | 5.996 | 6.00 kg | 6.00 kg | — | SUSPICIOUS | SUSPICIOUS |
| Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | 24 | 7.92 L | 7.92 L | 7.92 L | SAFE | SAFE |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | 11.25 L | 22.50 L | 22.50 L | BROKEN | SAFE |

## Blast Radius

**Expected:**
- Changed items: 6
- SAFE preserved: 11
- No new BROKEN from former SAFE

**Actual:**
- Population scanned (qty>1 structured): **25**
- Usable changed vs prior audit: **6**
- Former BROKEN now SAFE: **6** / 6
- Former SAFE now BROKEN: **0**

## Tests

`npm test -- src/lib/stock-normalization.test.ts` — **pass** (112 passed, 0 failed)

## Remaining Open Cases

- Mezzi 1KG×6 rowQty=2 — SUSPICIOUS (Family A extraction ambiguity; kg guard preserves 6 kg)
- count_size rowQty>1 with rowUnit=un (e.g. 24×80g) — preserved at structure_total
- size_count 5l×2 rowQty=2 equals inner — Peroni rule would not scale (no VL exemplar)

Evidence: `.tmp/outer-quantity-family-implementation-validation/results.json`