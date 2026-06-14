# UI Before / After — Create Ingredient Consolidation

**Generated:** 2026-06-14

## Before

| Row state | Visible controls |
|-----------|------------------|
| **Confirmed** | `Matched to` chip → picker Actions (Create ingredient, No match, reassign) |
| **Suggested** | `Matched to` chip + **Confirm match** → picker Actions |
| **Unmatched** | `Select ingredient…` chip + **Create new ingredient** (external button) → picker Actions |
| **Rejected** | `Select ingredient…` chip + **Create new ingredient** (external button) → picker Actions |

**Problem:** Unmatched and rejected rows showed duplicate create entry points — external `"Create new ingredient"` button and picker `"Create ingredient"` action both called the same `onCreateIngredient(renderItem)` handler.

## After

| Row state | Visible controls |
|-----------|------------------|
| **Confirmed** | `Matched to` chip → picker Actions (Create ingredient, No match, reassign) |
| **Suggested** | `Matched to` chip + **Confirm match** → picker Actions |
| **Unmatched** | `Select ingredient…` chip → picker Actions (Create ingredient, No match, reassign) |
| **Rejected** | `Select ingredient…` chip → picker Actions (Create ingredient, No match, reassign) |

**Single create entry:** `InvoiceIngredientCorrectionPicker` → Actions → `"Create ingredient"` for all row states.
