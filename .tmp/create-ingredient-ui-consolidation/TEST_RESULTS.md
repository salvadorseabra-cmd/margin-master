# Test Results — Create Ingredient Consolidation

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
| `invoice-ingredient-correction.test.ts` | Confirm match renders for suggested rows; empty when not shown |
| `invoice-ingredient-correction-picker.test.ts` | Matched to chip label; Select ingredient placeholder; picker props wired |
| `ingredient-correction-memory.test.ts` | UI state for suggested/confirmed/unmatched/rejected rows |

## Behavioral Guarantees

- ✅ Create ingredient path preserved via picker `onCreateIngredient` prop (unchanged wiring)
- ✅ Confirm match still available for suggested rows
- ✅ Reassign still via picker `onSelect`
- ✅ No match still via picker `onSelectNoMatch`
- ✅ No `"Create new ingredient"` string remains in `src/`
