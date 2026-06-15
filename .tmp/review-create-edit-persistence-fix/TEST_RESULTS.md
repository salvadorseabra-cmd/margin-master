# Test Results

**Date:** 2026-06-15

## Command

```bash
npm test -- src/components/bulk-canonical-ingredient-create-sheet.test.ts src/lib/bulk-canonical-ingredient-create.test.ts
```

## Result

**11/11 passed**

## New tests

### `src/components/bulk-canonical-ingredient-create-sheet.test.ts`

| Test | Asserts |
|------|---------|
| initializes rows when sheet opens | Suggestion `Stracciatella 250gr` on first open |
| keeps Stracciatella edit after candidates refresh | Edit → `Stracciatella` survives refresh → submit value `Stracciatella` |
| keeps Mezzi paccheri edit after candidates refresh | Edit → `Mezzi paccheri` survives refresh |
| adds new candidates without resetting existing edits | Prior edit kept; new row gets suggestion |

### `src/lib/bulk-canonical-ingredient-create.test.ts` (extended)

| Test | Asserts |
|------|---------|
| passes edited Stracciatella through bulk submit pipeline | `buildBulkSubmitValuesFromDefaults` + `buildExplicitCanonicalInsertPayload` → `payload.name === "Stracciatella"` |
| passes edited Mezzi paccheri through bulk submit pipeline | Same for `Mezzi paccheri` |
| persists edited Stracciatella through `saveCanonicalIngredientFromInvoiceRow` | Full save + `persistIngredientFromInvoiceItem` with mocked insert |
| persists edited Mezzi paccheri through `saveCanonicalIngredientFromInvoiceRow` | Same |

## Notes

- No React Testing Library in project; sheet behavior tested via exported `mergeBulkCanonicalIngredientRows`.
- E2E persistence tests mock Supabase `ingredients.select` (archived lookup) and `insert` chain.
