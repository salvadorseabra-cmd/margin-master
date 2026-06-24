# Ovo Classe M Dozen Parsing Fix — Implementation Validation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Validated:** 2026-06-24T00:48:01.767Z  
**Verdict:** **A — Safe to merge**

## Changed Files

- `src/lib/stock-normalization.ts`
- `src/lib/stock-normalization.test.ts`

## Before / After — Ovo MORENO Classe M

| Field | Before | After |
|-------|--------|-------|
| `parsePurchaseStructureFromText` | `null` | tier `caixa_dozen_count`, total 180 `un` |
| `purchase_quantity` | 1 | **180** |
| `usable_quantity` (persist) | null | **180** |
| Unit cost | €38.44/egg | **€0.2136/egg** |
| `structured.kind` | `row_only` | `multi_unit_pack` |

## Recipe Costing Replay

| Recipe qty | Expected | Actual |
|------------|----------|--------|
| 1 egg | €0.2136 | €0.2136 |
| 6 eggs | €1.28 | €1.2813 |
| 12 eggs | €2.56 | €2.5627 |

## Ovo Checks

- parserNotNull: PASS
- tier: PASS
- totalUsableAmount: PASS
- usableUnit: PASS
- innerUnitCount: PASS
- unitSize: PASS
- purchase_quantity: PASS
- persist_purchase_quantity: PASS
- structuredKind: PASS
- normalizedUsableQuantity: PASS
- unitCostEur: PASS
- recipeCost1Egg: PASS
- recipeCost6Eggs: PASS
- recipeCost12Eggs: PASS
- unitsPerPack: PASS

## Regression Matrix

| Product | Tier | Total usable | Parser changed? |
|---------|------|--------------|-----------------|
| Peroni | size_count | 7920 | NO |
| Pellegrino | size_count | 11250 | NO |
| Nata | count_size | 6000 | NO |
| Chocolate | count_size | 2000 | NO |
| Açúcar | count_size | 10000 | NO |
| Mozzarella | size_count | 1000 | NO |
| Guanciale | size_count | 10500 | NO |
| Ginger Beer | bare_measure | 200 | NO |
| Salada | bare_measure | 250 | NO |

## Blast Radius (VL 52 items)

- Rows matching `caixa_dozen_count`: **1**

- `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` (480e66ee-dbee-4e2a-ac78-dc13a0f9fd63)
