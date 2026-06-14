# Test Results — Match UI Consolidation

**Generated:** 2026-06-14

## Command

```bash
npm test -- src/components/invoice-ingredient-correction.test.ts \
  src/components/invoice-ingredient-correction-picker.test.ts \
  src/lib/ingredient-correction-memory.test.ts
```

## Results

```
Test Files  3 passed (3)
Tests       15 passed (15)
```

## Coverage

| Test file | Assertions |
|-----------|------------|
| `invoice-ingredient-correction.test.ts` | Confirm match renders; Correct match never renders; empty when `showConfirm` false |
| `invoice-ingredient-correction-picker.test.ts` | Matched to chip label; placeholder for unmatched; no Correct match |
| `ingredient-correction-memory.test.ts` | UI state for suggested/confirmed/unmatched/rejected; `showWrongMatch` absent from type |

## Behavioral Guarantees

- ✅ Confirmed row correction still enters via Matched to chip (picker component test)
- ✅ Confirm match button still available for suggested rows
- ✅ Remove match / Create ingredient remain in picker (via `onSelectNoMatch` / `onCreateIngredient` props — unchanged)
- ✅ No "Correct match" string in any component render output
