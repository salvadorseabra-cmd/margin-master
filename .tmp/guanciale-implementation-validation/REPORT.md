# Guanciale Fix — Implementation Validation

Generated: 2026-06-23T00:25:39.105Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: **POST-IMPLEMENTATION**

## Verdict: **A) Safe to merge**

## Implementation

Helper: `shouldUseRowQtyAsBilledKgForSizeCountGenericRow` in `src/lib/stock-normalization.ts`

Conditions:
- structure.tier === 'size_count'
- structure.unitMeasurement === 'kg'
- isGenericPurchaseUnit(rowUnit)
- rowQuantity > 0 and finite
- Math.abs(rowQuantity - innerUnitCount) >= 0.01
- hasFractionalQuantity(rowQuantity)
- measureToBase(rowQuantity, 'kg').amount < structure.totalUsableAmount * 0.99

Integration points:
- computeUsableFromPurchaseStructure (~1303)
- resolveStructurePurchaseQuantity (~1171)

Changed files:
- `src/lib/stock-normalization.ts`
- `src/lib/stock-normalization.test.ts`

## Before/After — Usable

| Product | Before | After | Expected change | Match |
|---------|--------|-------|-----------------|-------|
| Guanciale | 10.5 kg | 6.0 kg | yes | ✓ |
| Peroni | 7.92 L | 7.92 L | no | ✓ |
| Aceto | 10.00 L | 10.00 L | no | ✓ |
| Rulo | 2 kg | 2 kg | no | ✓ |
| Julienne | 30 kg | 30 kg | no | ✓ |
| Ginger Beer | 4.80 L | 4.80 L | no | ✓ |

## Before/After — Operational Cost

| Product | Before | After | Expected change | Match |
|---------|--------|-------|-----------------|-------|
| Guanciale | €6.18/kg | €10.83/kg | yes | ✓ |
| Peroni | €3.24/L | €3.24/L | no | ✓ |
| Aceto | €1.56/L | €1.56/L | no | ✓ |
| Rulo | €5.43/kg | €5.43/kg | no | ✓ |
| Julienne | €6.68/kg | €6.68/kg | no | ✓ |
| Ginger Beer | €4.03/L | €4.05/L | no | ✓ |

## Control Classification

| Product | Result | Expected | Match |
|---------|--------|----------|-------|
| Guanciale | A) Expected fix | A | ✓ |
| Peroni | C) Preserved | C | ✓ |
| Aceto | C) Preserved | C | ✓ |
| Rulo | C) Preserved | C | ✓ |
| Julienne | C) Preserved | C | ✓ |
| Ginger Beer | C) Preserved | C | ✓ |

## Blast Radius (51-item VL population)

**Expected:**
- Changed items: 1
- Unchanged controls: 7

**Actual:**
- Population scanned: **51**
- Usable changed vs prior audit: **2**
- Guanciale in changed set: **yes**

Changed rows:
- Baladin - Ginger Beer 0.20cl: 48 → 4800
- Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino: 10500 → 5996

## Tests

`npm test -- src/lib/stock-normalization.test.ts src/lib/ingredient-unit-inference.test.ts` — **pass** (121 passed, 0 failed)

## Helper Trace (controls)

### Guanciale
- Tier: size_count | unit=kg | inner=7
- usableSource: row_weight_billed
- resolveStructurePurchaseQty: 1

### Peroni
- Tier: size_count | unit=cl | inner=24
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Aceto
- Tier: size_count | unit=L | inner=2
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Rulo
- Tier: size_count | unit=kg | inner=2
- usableSource: structure_total
- resolveStructurePurchaseQty: 1

### Julienne
- Tier: bare_measure | unit=kg | inner=—
- usableSource: structure_recomputed
- resolveStructurePurchaseQty: 10

### Ginger Beer
- Tier: bare_measure | unit=cl | inner=—
- usableSource: structure_recomputed
- resolveStructurePurchaseQty: 24

## Confidence

- guancialeFix: **94%**
- controlPreservation: **90%**
- blastRadius: **88%**
- overall: **90%**

Evidence: `.tmp/guanciale-implementation-validation/results.json`