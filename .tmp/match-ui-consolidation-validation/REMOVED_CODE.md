# Removed Code — Match UI Consolidation

**Generated:** 2026-06-14

## Handlers / Props Removed

| Item | Location | Notes |
|------|----------|-------|
| `onOpenCorrection` handler | `invoices.tsx` | Opened picker without `wasConfirmed` |
| `showCorrectionTrigger` variable | `invoices.tsx` | Gated Correct match + Create ingredient wrapper |
| `showCorrectionTrigger` prop | `IngredientCorrectionActions` | Removed |
| `correctionOpen` prop | `IngredientCorrectionActions` | Removed |
| `correctionDisabled` prop | `IngredientCorrectionActions` | Removed |
| `onOpenCorrection` prop | `IngredientCorrectionActions` | Removed |
| `correctionLinkClass` | `invoice-ingredient-correction.tsx` | Correct match link styles |
| Correct match `<button>` | `invoice-ingredient-correction.tsx` | Entire link UI |
| `showWrongMatch` field | `IngredientCorrectionUiState` | No longer drives any UI |
| `INVOICE_INGREDIENT_CORRECTION_NO_MATCH` | `invoice-ingredient-correction-picker.tsx` | Unused sentinel |
| `isInvoiceIngredientCorrectionNoMatch` | `invoice-ingredient-correction-picker.tsx` | Unused helper |

## Kept (Unchanged)

| Item | Purpose |
|------|---------|
| `InvoiceIngredientCorrectionPicker` | Sole correction surface (chip + dropdown) |
| `IngredientCorrectionActions` | **Confirm match** only (suggested rows) |
| Create new ingredient button | Unmatched / rejected rows |
| `openIngredientCorrection` with `wasConfirmed` | Chip `onOpenChange` path |
| `handleSelectCorrectionIngredient` | Reassign / correct via picker |
| `handleRemoveCorrectionMatch` | Remove match via picker |
| `onCreateIngredient` | Create ingredient flows |

## Files Changed

| File | Change |
|------|--------|
| `src/components/invoice-ingredient-correction.tsx` | Stripped to Confirm match only |
| `src/routes/invoices.tsx` | Removed Correct match wiring; split action row |
| `src/lib/ingredient-correction-memory.ts` | Removed `showWrongMatch` from UI state |
| `src/components/invoice-ingredient-correction-picker.tsx` | Removed unused no-match sentinel |
| `src/lib/ingredient-correction-memory.test.ts` | Updated UI state assertions |
| `src/components/invoice-ingredient-correction.test.ts` | **new** — no Correct match rendered |
| `src/components/invoice-ingredient-correction-picker.test.ts` | **new** — chip label / placeholder |
