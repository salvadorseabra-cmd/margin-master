# Intended vs Accidental Behavior

**Date:** 2026-06-15

## Verdict: **Explicit, intentional design**

Evidence:
- Phase 3 implementation: `isNonFoodInvoiceLine` + bulk create filter
- `.tmp/final-canonical-edge-cases/` — "Correct to stay out of catalog"
- Dedicated unit test in `canonical-ingredient-create.test.ts`

## Asymmetry is deliberate

- **Invoice Review:** All eligible OCR rows treated as potential ingredients
- **Review & Create:** Catalog-ingredient creation workflow with non-food blocklist

## UX gap (not accidental exclusion)

Recargo still inflates "not in ingredient list" count and shows "No match" + "Create ingredient" (submit fails). Inconsistent messaging, not wrong bulk exclusion.
