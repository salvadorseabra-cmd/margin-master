# UI Before / After — Match Correction Consolidation

**Generated:** 2026-06-14

## Before

| Row state | Visible controls |
|-----------|------------------|
| **Confirmed** | `Matched to` chip + **Correct match** link |
| **Suggested** | `Matched to` chip + **Confirm match** + **Correct match** link |
| **Unmatched** | `Select ingredient…` chip + **Correct match** link + Create new ingredient |
| **Rejected** | `Select ingredient…` chip + **Correct match** link + Create new ingredient |

**Problem:** "Correct match" and "Matched to" chip opened the same picker, but the link path omitted `wasConfirmed` in the correction snapshot — causing wrong MLS branch (`correctMatch` vs `reassignMatch`) on confirmed-row corrections.

## After

| Row state | Visible controls |
|-----------|------------------|
| **Confirmed** | `Matched to` chip only |
| **Suggested** | `Matched to` chip + **Confirm match** |
| **Unmatched** | `Select ingredient…` chip + Create new ingredient |
| **Rejected** | `Select ingredient…` chip + Create new ingredient |

**Single correction entry:** `InvoiceIngredientCorrectionPicker` chip/dropdown for all reassignment, remove-match, and create-ingredient actions.
