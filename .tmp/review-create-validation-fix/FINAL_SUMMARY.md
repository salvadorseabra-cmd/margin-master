# Final Summary — Review & Create Validation Blocker Fix

## Problem

Phase 2 cleaned catalog suggestions (`Pêra abacate`, `Ovo classe M`, `Salada ibérica`) were rejected at create time with a self-referential shorthand error, even though the confirmed name field already contained the correct cleaned value.

## Root cause

`looksLikeSupplierAbbreviatedCatalogName` unconditionally uppercased input before re-running `looksLikeInvoiceShorthandName`, causing title-cased catalog names with short tokens to be misclassified as invoice shorthand.

## Fix

Gated the `.toUpperCase()` re-check behind `upperRatio >= 0.82` in `looksLikeSupplierAbbreviatedCatalogName` (`canonical-ingredient-operational-name.ts`).

## Outcome

- Phase 2 Review & Create rows now pass validation and produce insert payloads.
- True invoice shorthand (`ANGUS PTY`, `BAT shoestr`) remains blocked.
- 62 tests in primary suites pass; 47 related tests pass with no regressions.

## Files changed

1. `src/lib/canonical-ingredient-operational-name.ts` — validation gate fix
2. `src/lib/canonical-ingredient-operational-name.test.ts` — allow/block tests
3. `src/lib/canonical-ingredient-create.test.ts` — validate + insert tests for Phase 2 examples
