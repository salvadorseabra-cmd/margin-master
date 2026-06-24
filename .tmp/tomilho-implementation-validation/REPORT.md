# Tomilho Fresh Herb Conversion — Implementation Validation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-24T01:48:08.613Z

---

## Verdict: A) Safe to merge

---

## Changed Files

| File | Change |
|------|--------|
| `src/lib/ingredient-unit-inference.ts` | Added `TOMILHO` to fresh herbs `PRODUCE_CONVERSION_HINTS` group (100g/bunch) |
| `src/lib/ingredient-unit-inference.test.ts` | `detectConversionHint("Tomilho")` → 100g; operational + recipe cost integration test |

---

## Tomilho Before / After (€2.06/bunch)

| Field | Before | After |
|-------|--------|-------|
| Conversion hint | null | **100 g/bunch (fresh herbs)** |
| Structured kind | row_only | **inferred** |
| Usable quantity | null | **100 g** |
| Procurement | €2.06 / bunch | €2.06 / bunch |
| Operational | null | **€20.60 / kg** |
| purchase_quantity | 1 | **100** |
| cost_base_unit | un | **g** |

### Recipe costs (gram denominator)

| Qty | Expected | Actual | Pass |
|-----|----------|--------|:----:|
| 10 g | €0.206 | €0.206 | ✓ |
| 25 g | €0.515 | €0.515 | ✓ |
| 50 g | €1.03 | €1.03 | ✓ |
| 100 g | €2.06 | €2.06 | ✓ |

---

## Regression Matrix

| Product | Must | Hint | Procurement | Operational | pq | Pass |
|---------|:----:|:----:|-------------|-------------|-----|:----:|
| Tomilho | FIX | ✓ | €2.06 / bunch | €20.60 / kg | 100 | ✓ |
| Manjericão | — | ✓ | €2.06 / bunch | €20.60 / kg | 100 | ✓ |
| Salsa | — | ✓ | €1.50 / bunch | €15.00 / kg | 100 | ✓ |
| Coentros | — | ✓ | €1.50 / bunch | €15.00 / kg | 100 | ✓ |
| Hortelã | — | ✓ | €5.40 / kg | €5.40 / kg | 1000 | ✓ |
| Cebolinho | — | ✓ | €1.80 / bunch | €18.00 / kg | 100 | ✓ |
| Salada Ibérica | — | — | €2.19 / pack | €8.76 / kg | 250 | ✓ |
| Ovo classe M | — | — | €38.44 / case | €0.2136 / egg | 180 | ✓ |
| Peroni | — | — | €1.07 / bottle | €3.24 / L | 7920 | ✓ |
| Pellegrino | — | — | €19.28 / case | €1.71 / L | 15 | ✓ |
| Guanciale | — | — | €89.50 / unit | €8.52 / kg | 1 | ✓ |

**11/11 passed** (10/10 regressions)

---

## Blast Radius (VL)

- **Total invoice items:** 52
- **Rows newly matching TOMILHO hint:** 1 (expected: 1)
  - `f2d094ab-f50a-483d-b6cb-76554d5bf195` — Tomilho


---

## Test Results

| Suite | Result |
|-------|--------|
| `ingredient-unit-inference.test.ts` | 18/18 pass |
| `invoice-purchase-price-semantics.test.ts` | 60/60 pass |
| `invoice-purchase-format.test.ts` | 87/89 pass (2 pre-existing 33cl display failures, unrelated) |

---

## Scope

Conversion hint only. Unchanged: recipe costing pipeline, persistence architecture, operational cost computation, stock-normalization, parser logic.
