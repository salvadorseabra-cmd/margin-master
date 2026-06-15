# Regression Audit — Phase 4C

**Validated:** `validate-historical-pricing.mts` + `validate-repair-scope.mts` post-repair

## Control ingredients (unchanged)

| Ingredient | Catalog op | Latest history op | Match |
|---|---|---|---|
| Mozzarella fior di latte | 13.69 | 13.69 | ✅ |
| Pepino conserva | 3.748 | 3.748 | ✅ |
| Arroz agulha | 1.162 | 1.162 | ✅ |

## Not in historical-pricing validator scope

These were **not modified** by Phase 4C (no history rows in repair scope):

| Ingredient | Status |
|---|---|
| Nata culinária | Unchanged — suggested-match row only; not in 4C scope |
| Açúcar | Not in VL validation sample — no repair touch |
| Chocolate | Not in VL validation sample — no repair touch |

## Phase 4A/4B regressions

| Check | Result |
|---|---|
| Mozzarella row count (1 keep) | ✅ (fix_2 in validate-repair-scope) |
| created_at corruption count | 0 ✅ |
| Pepino `cx` pack path | ✅ unchanged |
| Duplicate history groups | 0 ✅ |

## Code regression

`invoice-purchase-price-semantics.test.ts`: **44/44 passed** including new multi-`un` cases and aggregate-total guard.
