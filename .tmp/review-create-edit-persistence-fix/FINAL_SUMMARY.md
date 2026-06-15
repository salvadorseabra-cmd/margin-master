# Final Summary — Bulk Review & Create Edit Persistence

**Date:** 2026-06-15

## Problem

Users edited canonical names in the bulk Review & Create sheet, but created ingredients kept suggestion names (e.g. `Stracciatella 250gr` instead of `Stracciatella`).

## Root cause

Row state reset on every `candidates` reference change while the sheet was open.

## Fix

`mergeBulkCanonicalIngredientRows` + functional `setRows` in `bulk-canonical-ingredient-create-sheet.tsx`. Edits survive parent re-renders; state clears when the sheet closes.

## Files changed

| File | Change |
|------|--------|
| `src/components/bulk-canonical-ingredient-create-sheet.tsx` | Merge-based row init; export merge helper |
| `src/components/bulk-canonical-ingredient-create-sheet.test.ts` | **New** — regression tests for edit survival |
| `src/lib/bulk-canonical-ingredient-create.test.ts` | Extended — pipeline + save persistence tests |

## Verification

- 11/11 targeted tests pass.
- Edited `canonicalName` confirmed through `buildBulkSubmitValuesFromDefaults`, `buildExplicitCanonicalInsertPayload`, `saveCanonicalIngredientFromInvoiceRow`, and `persistIngredientFromInvoiceItem`.

## Confirmation

Edited names now persist correctly through bulk submit when the parent refreshes candidates while the sheet remains open.
