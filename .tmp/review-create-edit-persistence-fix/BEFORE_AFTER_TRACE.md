# Before / After Trace

**Date:** 2026-06-15

## Scenario: Stracciatella 250gr → Stracciatella

### Before fix

| Step | State |
|------|-------|
| 1. User opens Review & Create | `canonicalName = "Stracciatella 250gr"` |
| 2. User edits input | `canonicalName = "Stracciatella"` |
| 3. Parent re-renders (`candidates` new ref) | `useEffect` runs → **reset** → `canonicalName = "Stracciatella 250gr"` |
| 4. User clicks Create | `onSubmit([{ canonicalName: "Stracciatella 250gr" }])` |
| 5. DB insert | `ingredients.name = "Stracciatella 250gr"` |
| 6. UI "Matched to" | Shows `Stracciatella 250gr` (matches suggestion, not edit) |

### After fix

| Step | State |
|------|-------|
| 1. User opens Review & Create | `canonicalName = "Stracciatella 250gr"` |
| 2. User edits input | `canonicalName = "Stracciatella"` |
| 3. Parent re-renders | `mergeBulkCanonicalIngredientRows` → **preserved** → `canonicalName = "Stracciatella"` |
| 4. User clicks Create | `onSubmit([{ canonicalName: "Stracciatella" }])` |
| 5. `buildBulkSubmitValuesFromDefaults` | `values.canonicalName = "Stracciatella"` |
| 6. `buildExplicitCanonicalInsertPayload` | `payload.name = "Stracciatella"` |
| 7. `persistIngredientFromInvoiceItem` | Insert with `name: "Stracciatella"` |
| 8. UI "Matched to" | Shows `Stracciatella` |

## Scenario: Mezzi paccheri mancini → Mezzi paccheri

Same pattern: before fix, refresh reverted to `Mezzi paccheri mancini`; after fix, edited `Mezzi paccheri` flows through submit and insert.

## Sheet close / reopen

| Event | Behavior |
|-------|----------|
| Sheet closes | `setRows([])` — fresh state on next open |
| Sheet reopens | Rows re-initialize from current suggestions |
