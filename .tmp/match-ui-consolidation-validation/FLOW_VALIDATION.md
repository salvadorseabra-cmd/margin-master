# Flow Validation — Match UI Consolidation

**Generated:** 2026-06-14

## UI State Matrix (Post-Consolidation)

| State | Matched to chip | Confirm match | Correct match | Create new ingredient |
|-------|-----------------|---------------|---------------|----------------------|
| **Confirmed** | ✅ | ❌ | ❌ | ❌ |
| **Suggested** | ✅ | ✅ | ❌ | ❌ |
| **Unmatched** | ✅ (placeholder) | ❌ | ❌ | ✅ |
| **Rejected** | ✅ (placeholder) | ❌ | ❌ | ✅ |

## Correction Flows (All via Chip)

| Action | Entry | Handler chain | Status |
|--------|-------|---------------|--------|
| **Reassign A→B** | Matched to chip → select B | `handleSelectCorrectionIngredient` → `selectIngredientForItem` → `reassignMatch` (if `wasConfirmed`) | ✅ Preserved; chip sets `wasConfirmed` |
| **Remove match** | Chip → No match | `handleRemoveCorrectionMatch` → `unmatchInvoiceLineMatch` | ✅ Preserved |
| **Create ingredient** | Chip action or standalone button | `onCreateIngredient` → `saveCanonicalIngredientFromInvoice` | ✅ Preserved |
| **Confirm suggested** | Confirm match button | `onConfirmIngredientMatch` → `confirmIngredientMatch` | ✅ Preserved (one-click, no picker) |

## Metadata Fix

| Entry | `wasConfirmed` in snapshot |
|-------|---------------------------|
| Matched to chip (before & after) | `displayState === "confirmed"` ✅ |
| ~~Correct match link~~ | ~~omitted → false~~ **REMOVED** |

Eliminates the dual-entry `wasConfirmed` divergence that caused incorrect MLS/pricing branch on confirmed-row corrections.

## Scope Compliance

- No schema changes
- No MLS architecture changes
- No pricing / Pack Variants / remediation changes
- UI consolidation only
