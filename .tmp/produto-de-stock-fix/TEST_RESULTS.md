# Test Results — Produto de Stock Fix

**Date:** 2026-06-15

## Command

```bash
npx vitest run src/lib/invoice-item-fields.test.ts src/lib/canonical-ingredient-create.test.ts src/lib/canonical-ingredient-display-name.test.ts
```

## Result

**3 files, 92 tests — all passed**

## New tests

### `invoice-item-fields.test.ts` — `cleanInvoiceItemDisplayName`

| Test | Input | Expected |
|------|-------|----------|
| Trailing suffix | `De Cecco - Paccheri Lisci Nr. 125 - 500g Produto de Stock` | `De Cecco - Paccheri Lisci Nr. 125 - 500g` |
| Slash variant | `Rigamonti / Produto de Stock` | `Rigamonti` |
| Dash variant | `Rigamonti - Bresaola Punta d'Anca Oro 1/2 - Produto de Stock` | `Rigamonti - Bresaola Punta d'Anca Oro 1/2` |

### `canonical-ingredient-create.test.ts`

| Test | Assertion |
|------|-----------|
| `strips Produto de Stock from canonical suggestions` | Contaminated SanPellegrino → `suggestedCanonicalName` is `Sanpellegrino acqua in vitro 75cl 15ud` and does not contain `produto de stock` |

## Regression

All 89 pre-existing tests in the three files continue to pass.
