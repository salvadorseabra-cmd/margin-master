# Removed Code — Create Ingredient Consolidation

**Generated:** 2026-06-14

## JSX Removed (`src/routes/invoices.tsx`)

### External "Create new ingredient" button

Removed standalone button shown on unmatched/rejected rows:

- Label: `"Create new ingredient"`
- Handler: `onClick={() => onCreateIngredient(renderItem)}`
- Disabled: `creatingIngredient || !canCreateIngredient`
- Spinner: `Loader2` when `creatingIngredient`
- Title tooltips for placeholder vs valid names

### Wrapper condition simplified

**Before:** Outer action row rendered when `correctionUi.showConfirm || unmatchedIngredient || correctionUi.suppressMatchPresentation`

**After:** Outer action row renders only when `correctionUi.showConfirm && possibleIngredientMatch` (Confirm match for suggested rows)

The unmatched/rejected visibility conditions that existed solely to show the external create button were removed with the button.

## Not Removed (Still Active)

| Symbol | Reason |
|--------|--------|
| `onCreateIngredient` prop on `InvoiceIngredientCorrectionPicker` | Picker create action |
| `createIngredientDisabled` | Same disabled logic, now picker-only |
| `canCreateIngredient` | Used by picker disabled state |
| `creatingIngredient` | Used by picker disabled state |
| `openCanonicalIngredientCreate` / `saveCanonicalIngredientFromInvoice` | Unchanged persistence path |

## Dead Code Audit

| Item | Status |
|------|--------|
| `showCreateIngredientButton` | **Never existed** — no removal needed |
| External button visibility conditions | **Removed** — only served external button |
| Picker `onCreateIngredient` wiring | **Kept** |
