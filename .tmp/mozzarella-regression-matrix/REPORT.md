# Mozzarella Fix — Regression Matrix Validation

Generated: 2026-06-22T20:56:17.897Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: **STRICT READ-ONLY**

## Proposed Fix (Option A)

Helper: `shouldScaleOuterPackForSizeCountGenericRow` in `resolveStructurePurchaseQuantity` + `computeUsableFromPurchaseStructure`

Conditions:
- structure.tier === 'size_count'
- isGenericPurchaseUnit(rowUnit)
- rowQuantity > 1
- rowQuantity !== innerUnitCount (±0.01)
- structure.unitMeasurement not in ['kg', 'L']

## TASK 1 — Usable Replay

| Product | Current Usable | Simulated Usable | Changed? |
|---------|----------------|------------------|----------|
| Mozzarella | 1 kg | 10 kg | **YES** |
| Stracciatella | 6 kg | 6 kg | no |
| Peroni | 7.92 L | 7.92 L | no |
| S.Pellegrino (Bocconcino) | 11.25 L | 22.50 L | **YES** |
| S.Pellegrino (Emporio) | 11.25 L | 22.50 L | **YES** |
| Guanciale | 10.5 kg | 10.5 kg | no |
| Mezzi | 6 kg | 6 kg | no |
| Ricotta | 3 kg | 3 kg | no |

## TASK 2 — Regression Matrix (Op Cost)

| Product | Current Op Cost | Simulated Op Cost | Changed? |
|---------|-----------------|-------------------|----------|
| Mozzarella | €81.20/kg | €8.12/kg | **YES** |
| Stracciatella | €12.44/kg | €12.44/kg | no |
| Peroni | €3.24/L | €3.24/L | no |
| S.Pellegrino (Bocconcino) | €3.73/L | €1.86/L | **YES** |
| S.Pellegrino (Emporio) | €3.43/L | €1.71/L | **YES** |
| Guanciale | €6.18/kg | €6.18/kg | no |
| Mezzi | €4.55/kg | €4.55/kg | no |
| Ricotta | €2.66/kg | €2.66/kg | no |

## TASK 3 — Control Validation

| Product | Classification | Expected | Match |
|---------|----------------|----------|-------|
| Mozzarella | A) Expected change | A) Expected change | ✓ |
| Stracciatella | C) No change | C) No change | ✓ |
| Peroni | C) No change | C) No change | ✓ |
| S.Pellegrino (Bocconcino) | B) Unexpected change | C) No change | ✗ |
| S.Pellegrino (Emporio) | B) Unexpected change | C) No change | ✗ |
| Guanciale | C) No change | C) No change | ✓ |
| Mezzi | C) No change | C) No change | ✓ |
| Ricotta | C) No change | C) No change | ✓ |

## TASK 4 — Blast Radius

- Total evaluated: **8**
- Changed: **3**
- Expected change: **1**
- Unexpected change: **2**
- No change: **5**
- Only Mozzarella changed: **no**

## TASK 5 — Implementation Blockers

- **rootCauseLocalized**: A) Proven
- **helperLogicScoped**: B) Needs validation
- **productionReplayMatchesVl**: A) Proven
- **reIngestPath**: B) Needs validation
- **sanPellegrinoClCaveat**: B) Needs validation — helper fires on Emporio row

## TASK 6 — Final Readiness

**B) Control impact**

## Helper Trace (per row)

### Mozzarella
- Tier: size_count | inner=8 | unit=g
- Helper fires: **YES**
- Conditions: tier_size_count=true, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=true, unit_not_kg_L=true
- purchaseQty: 1 → 10
- usableSource: structure_total → structure_scaled_outer
- Note: Fix target — size_count 125GR*8, qty=10

### Stracciatella
- Tier: bare_measure | inner=— | unit=g
- Helper fires: **no**
- Conditions: tier_size_count=false, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=false, unit_not_kg_L=true
- purchaseQty: 24 → 24
- usableSource: structure_recomputed → structure_recomputed
- Note: bare_measure tier — not size_count

### Peroni
- Tier: size_count | inner=24 | unit=cl
- Helper fires: **no**
- Conditions: tier_size_count=true, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=false, unit_not_kg_L=true
- purchaseQty: 1 → 1
- usableSource: structure_total → structure_total
- Note: rowQty === innerCount (24)

### S.Pellegrino (Bocconcino)
- Tier: **size_count** (not caixa_units_size — design assumed CX tier; parser matches `75CL*15`)
- inner=15 | unit=cl | rowQty=2
- Helper fires: **YES**
- Conditions: tier_size_count=true, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=true, unit_not_kg_L=true
- purchaseQty: 1 → 2 | usable: 11.25 L → **22.50 L** | op: €3.73/L → **€1.86/L**
- usableSource: structure_total → structure_scaled_outer

### S.Pellegrino (Emporio)
- Tier: size_count | inner=15 | unit=cl
- Helper fires: **YES**
- Conditions: tier_size_count=true, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=true, unit_not_kg_L=true
- purchaseQty: 1 → 2
- usableSource: structure_total → structure_scaled_outer
- Note: size_count cl — unitMeasurement ∉ {kg,L}; rowQty≠inner but volume unit caveat

### Guanciale
- Tier: size_count | inner=7 | unit=kg
- Helper fires: **no**
- Conditions: tier_size_count=true, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=true, unit_not_kg_L=false
- purchaseQty: 1 → 1
- usableSource: structure_total → structure_total
- Note: unitMeasurement=kg excluded

### Mezzi
- Tier: **size_count** (parser matches `1KG*6` inside CX name; not caixa_units_size)
- inner=6 | unit=kg | rowQty=2
- Helper fires: **no** (unitMeasurement=kg excluded)
- purchaseQty: 1 → 1 | usable: 6 kg unchanged
- Note: Family A separate track — qty inflation, not this fix

### Ricotta
- Tier: bare_measure | inner=— | unit=kg
- Helper fires: **no**
- Conditions: tier_size_count=false, generic_row=true, rowQty_gt_1=true, rowQty_ne_inner=false, unit_not_kg_L=false
- purchaseQty: 2 → 2
- usableSource: structure_recomputed → structure_recomputed
- Note: bare/kg — no size_count token

## Answer

**Does the proposed fix change anything besides Mozzarella?** **Yes** — both S.Pellegrino controls regress under Option A as written.

Root cause of control impact (evidence-only):
- `ACQUA S.PELLEGRINO (CX 75CL*15)` and `SanPellegrino … 75cl x 15ud` both parse as **size_count** (`75CL*15`, inner=15, unitMeasurement=**cl**).
- Row qty=2 ≠ inner=15 and `cl ∉ {kg,L}` → helper fires → outer scaling doubles usable (11.25 L → 22.50 L) and halves €/L.
- Design doc assumed Bocconcino row was **caixa_units_size** (preserve=true); live parser tier differs.
- Peroni preserved (rowQty=inner), Guanciale/Mezzi preserved (kg exclusion), Stracciatella/Ricotta preserved (bare_measure).

## Confidence

- Regression matrix: **62%**
- Mozzarella fix target: **94%**
- Control preservation: **55%**
- Overall: **65%**

VL rows fetched: 8/8. Evidence: `.tmp/mozzarella-regression-matrix/results.json`