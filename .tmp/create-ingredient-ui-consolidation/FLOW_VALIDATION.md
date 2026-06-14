# Flow Validation — Create Ingredient Consolidation

**Generated:** 2026-06-14

## UI State Matrix (Post-Change)

| State | Matched to / Select chip | Confirm match | Create ingredient (picker) | No match (picker) |
|-------|--------------------------|---------------|----------------------------|-------------------|
| **Confirmed** | Yes — `Matched to: …` | No | Yes — Actions group | Yes — Actions group |
| **Suggested** | Yes — `Matched to: …` | Yes | Yes — Actions group | Yes — Actions group |
| **Unmatched** | Yes — `Select ingredient…` | No | Yes — Actions group | Yes — Actions group |
| **Rejected** | Yes — `Select ingredient…` | No | Yes — Actions group | Yes — Actions group |

## Handler Paths (Unchanged)

| Action | Entry | Handler chain |
|--------|-------|---------------|
| **Create ingredient** | Picker → Actions → Create ingredient | `onCreateIngredient(renderItem)` → `openCanonicalIngredientCreate` → `CanonicalIngredientCreateDialog` → `saveCanonicalIngredientFromInvoice` |
| **Confirm match** | Confirm match button (suggested only) | `onConfirmIngredientMatch(renderItem, possibleIngredientMatch)` |
| **Reassign** | Picker → select existing ingredient | `handleSelectCorrectionIngredient(renderItem, ingredientId, rawName)` |
| **No match** | Picker → Actions → No match | `handleRemoveCorrectionMatch(renderItem, rawName)` |

## Behavioral Notes

1. **No functional loss** — external button and picker action shared identical handler, dialog, persistence, and MLS dual-write path (audit: `CONSOLIDATE_TO_PICKER`).
2. **Confirmed/suggested rows** — unchanged; external button was never visible on these states.
3. **Unmatched/rejected rows** — one fewer visible control; create now requires opening the chip picker (same as confirmed/suggested).
