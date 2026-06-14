# Final Verdict — Create Ingredient UI Consolidation

**Generated:** 2026-06-14

## Verdict: **SUCCESS**

External `"Create new ingredient"` button removed from ItemsTable invoice review UI. Single create entry via `InvoiceIngredientCorrectionPicker` → Actions → `"Create ingredient"`. All relevant tests pass.

---

## Validation Questions

### 1. Any behavior changes?

**Yes — UI-only, no functional change.**

- Unmatched and rejected rows no longer show a standalone `"Create new ingredient"` button beside the chip.
- Create is still available inside the picker Actions menu on all row states.
- Confirm match, reassign, and no-match flows are unchanged.

### 2. Any persistence changes?

**No.**

Same handler chain: `onCreateIngredient` → `openCanonicalIngredientCreate` → `saveCanonicalIngredientFromInvoice` → alias persist + MLS dual-write.

### 3. Any Match Lifecycle changes?

**No.**

No MLS branch, schema, or dual-write logic modified.

### 4. Any dead code removed?

**Yes.**

- External create button JSX (~16 lines)
- Wrapper visibility conditions (`unmatchedIngredient || correctionUi.suppressMatchPresentation`) that existed only to host the external button
- `showCreateIngredientButton` was never present in codebase

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/invoices.tsx` | Removed external create button; simplified Confirm match wrapper condition |

## JSX Removed

- Standalone `<button>Create new ingredient</button>` block
- Outer wrapper conditions tied to unmatched/rejected create visibility

## Tests Executed

15/15 passed across 3 test files (see `TEST_RESULTS.md`).

## Rollback

Restore external button block in `invoices.tsx` at the Confirm match wrapper (~lines 3764–3773) with visibility `(unmatchedIngredient || correctionUi.suppressMatchPresentation)`.
