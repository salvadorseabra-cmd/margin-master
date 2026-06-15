# Final Verdict — Review & Create Validation Blocker

## Summary

Phase 2 name cleanup produces valid catalog suggestions, but create validation falsely rejects them because `looksLikeSupplierAbbreviatedCatalogName` uppercases title-cased names and re-applies invoice-shorthand heuristics. The error message quotes the exact name already in the field.

## Severity

**High / P0 for Review & Create** — users cannot create ingredients for common Phase 2 cases (Pêra abacate, Ovo classe M, Salada ibérica, etc.).

## Fix confidence

**High** — root cause isolated to `looksLikeSupplierAbbreviatedCatalogName` `.toUpperCase()` branch; one guard fix with clear regression tests.

## Affected surfaces

- Single-row Create catalog ingredient dialog
- Bulk Review new ingredients sheet
- Both share `validateCanonicalIngredientName` + `persistIngredientFromInvoiceItem` guards

## Not affected

- Phase 1 catalog-ready herbs (Tomilho, etc.)
- True invoice shorthand (ANGUS PTY) — still correctly blocked

## Recommendation

Apply the `upperRatio >= 0.82` gate in `looksLikeSupplierAbbreviatedCatalogName`. No schema, matching, or pricing changes required.
