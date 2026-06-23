# Mozzarella Fix — Implementation Validation

Generated: 2026-06-22T22:36:21.852Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: **POST-IMPLEMENTATION**

## Verdict: **A) Safe to merge**

## Implementation

Helper: `shouldScaleOuterPackForSizeCountGenericRow` in `src/lib/stock-normalization.ts`

Conditions:
- structure.tier === 'size_count'
- isGenericPurchaseUnit(rowUnit)
- rowQuantity > 1
- rowQuantity !== innerUnitCount (±0.01)
- structure.unitMeasurement === 'g'

Changed files:
- `src/lib/stock-normalization.ts`
- `src/lib/stock-normalization.test.ts`

## Before/After — Usable

| Product | Before | After | Expected change | Match |
|---------|--------|-------|-----------------|-------|
| Mozzarella | 1 kg | 10 kg | yes | ✓ |
| Stracciatella | 6 kg | 6 kg | no | ✓ |
| Peroni | 7.92 L | 7.92 L | no | ✓ |
| S.Pellegrino (Boc) | 11.25 L | 11.25 L | no | ✓ |
| S.Pellegrino (Emp) | 11.25 L | 11.25 L | no | ✓ |
| Guanciale | 10.5 kg | 10.5 kg | no | ✓ |
| Mezzi | 6 kg | 6 kg | no | ✓ |
| Ricotta | 3 kg | 3 kg | no | ✓ |

## Before/After — Operational Cost

| Product | Before | After | Expected change | Match |
|---------|--------|-------|-----------------|-------|
| Mozzarella | €81.20/kg | €8.12/kg | yes | ✓ |
| Stracciatella | €12.44/kg | €12.44/kg | no | ✓ |
| Peroni | €3.24/L | €3.24/L | no | ✓ |
| S.Pellegrino (Boc) | €3.73/L | €3.73/L | no | ✓ |
| S.Pellegrino (Emp) | €3.43/L | €3.43/L | no | ✓ |
| Guanciale | €6.18/kg | €6.18/kg | no | ✓ |
| Mezzi | €4.55/kg | €4.55/kg | no | ✓ |
| Ricotta | €2.66/kg | €2.66/kg | no | ✓ |

## Control Classification

| Product | Result | Expected | Match |
|---------|--------|----------|-------|
| Mozzarella | A) Expected fix | A | ✓ |
| Stracciatella | C) Preserved | C | ✓ |
| Peroni | C) Preserved | C | ✓ |
| S.Pellegrino (Boc) | C) Preserved | C | ✓ |
| S.Pellegrino (Emp) | C) Preserved | C | ✓ |
| Guanciale | C) Preserved | C | ✓ |
| Mezzi | C) Preserved | C | ✓ |
| Ricotta | C) Preserved | C | ✓ |

## Blast Radius (51-item VL population)

**Expected:**
- Changed items: 1
- Unchanged controls: 7

**Actual:**
- Population scanned: **51**
- Usable changed vs prior audit: **1**
- Only Mozzarella changed: **yes**

Changed rows:
- MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8: 1000 → 10000

## Tests

`npm test -- src/lib/stock-normalization.test.ts` — **pass** (97 tests)

## Helper Trace (controls)

### Mozzarella
- Tier: size_count | unit=g | inner=8
- usableSource: structure_scaled_outer
- resolveStructurePurchaseQty: 10

### Stracciatella
- Tier: bare_measure | unit=g | inner=—
- usableSource: structure_recomputed
- resolveStructurePurchaseQty: 24

### Peroni
- Tier: size_count | unit=cl | inner=24
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### S.Pellegrino (Boc)
- Tier: size_count | unit=cl | inner=15
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### S.Pellegrino (Emp)
- Tier: size_count | unit=cl | inner=15
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Guanciale
- Tier: size_count | unit=kg | inner=7
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Mezzi
- Tier: size_count | unit=kg | inner=6
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Ricotta
- Tier: bare_measure | unit=kg | inner=—
- usableSource: structure_recomputed
- resolveStructurePurchaseQty: 2

## Confidence

- mozzarellaFix: **95%**
- controlPreservation: **92%**
- blastRadius: **91%**
- overall: **92%**

Evidence: `.tmp/mozzarella-implementation-validation/results.json`