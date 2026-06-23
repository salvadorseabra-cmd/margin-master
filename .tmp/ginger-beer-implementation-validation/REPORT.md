# Ginger Beer Implementation Validation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-22T23:04:33.522Z  
**Verdict:** **A) Safe to merge**

## Fix

`normalizeDecimalLeadingClQuantity()` in `src/lib/ingredient-unit-inference.ts` — treats `0.XXcl` invoice typo as `XXcl` (missing leading digit). Wired into `detectVolume` and `stock-normalization.parseSizeAndUnit` for CL tokens.

## Volume token unit tests

| Token | Expected | Actual | Pass |
|-------|----------|--------|------|
| 0.20cl | 200 ml | 200 ml | ✓ |
| 20cl | 200 ml | 200 ml | ✓ |
| 200ml | 200 ml | 200 ml | ✓ |
| 0.75L | 750 ml | 750 ml | ✓ |
| 75cl | 750 ml | 750 ml | ✓ |
| 5L | 5000 ml | 5000 ml | ✓ |

## Ginger Beer before / after

| Metric | Before | After |
|--------|--------|-------|
| Purchased | 24 | 24 |
| Per-bottle volume | 2 ml | 200 ml |
| Usable total | 48 ml | 4800 ml (4.8 L) |
| Operational cost | €405/L | €4.05/L |

## Regression controls

| Product | Usable | €/unit | Pass |
|---------|--------|--------|------|
| ginger_beer | 4800 ml | €4.05/L | ✓ |
| pellegrino | 11250 ml | €3.43/L | ✓ |
| peroni | 7920 ml | €3.24/L | ✓ |
| aceto | 10000 ml | €1.56/L | ✓ |
| mozzarella | 10000 g | €8.12/kg | N/A (g-scaling fix) |
| guanciale | 10500 g | €6.18/kg | ✓ |

**Regression (in-scope):** 5/5 passed  
**Mozzarella:** out of scope — parallel `shouldScaleOuterPackForSizeCountGenericRow` g-scaling fix already in workspace; decimal-cl guard does not touch `g` units.

## VL population blast radius (51 items)

- Items changed from known pre-fix baseline: **1**
- Only Ginger Beer (`634a418b…`) expected to change usable ml (48 → 4800)

- `634a418b-1509-42a9-bf01-563705967b6f` Baladin - Ginger Beer 0.20cl: 48 → 4800

## Vitest

```
 ✓ src/lib/ingredient-unit-inference.test.ts (15 tests) 93ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  00:04:30
   Duration  1.83s (transform 352ms, setup 0ms, collect 589ms, tests 93ms, environment 0ms, prepare 277ms)


```

**Pass:** 15 · **Fail:** 0

## Changed files

- `src/lib/ingredient-unit-inference.ts` — `normalizeDecimalLeadingClQuantity`, `detectVolume` CL branch
- `src/lib/ingredient-unit-inference.test.ts` — volume token tests
- `src/lib/stock-normalization.ts` — import + CL apply in `parseSizeAndUnit` (bare_measure path)
