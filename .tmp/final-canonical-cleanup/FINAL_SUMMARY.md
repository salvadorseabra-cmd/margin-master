# Final Summary — Canonical Identity Final Cleanup

**Date:** 2026-06-15

---

## Files changed

- `src/lib/canonical-ingredient-display-name.ts`
- `src/lib/ingredient-operational-aliases.ts`
- `src/lib/canonical-ingredient-create.ts`
- `src/lib/bulk-canonical-ingredient-create.ts`
- `src/lib/canonical-ingredient-display-name.test.ts`
- `src/lib/canonical-ingredient-create.test.ts`
- `src/lib/canonical-ingredient-operational-name.test.ts`

## Rules added (summary)

1. Strip distributor noise: simonetta, caputo, toschi, pet, expet, nr + `*N` / fused-weight / SKU debris
2. Expand MOZZA → Mozzarella (preserve fior di latte, julienne)
3. Strip De Cecco / Baladin invoice brand prefixes only
4. Normalize San Pellegrino beverage shorthand — **keep brand** + serving size
5. Exclude `recargo por combustibili` from canonical create workflow

## Tests

78/78 passing across 3 canonical test files.

## Final scorecard

| Metric | Value |
|--------|-------|
| Usable | **29/33 (87.9%)** |
| EXCELLENT | 18 |
| ACCEPTABLE | 11 |
| WEAK | 3 |
| EMPTY | 1 (Recargo — intentional) |
| Food-only usable | 29/32 (90.6%) |

Progress: Baseline 27.3% → Phase 1 60.6% → Phase 2 75.8% → **Final 87.9%**

## Remaining unresolved (out of scope)

| Row | Issue |
|-----|-------|
| Arrigoni Gorgonzola DOP… | Complex Emporio cheese SKU line |
| Birra Peroni… | Duplicate `nastro azzurro` brand token in suggestion |
| Filete de Anchovas Alconfirsta L1… | Supplier code `L1` noise |
| Farina do pasta… | OCR `do` (should be `da`) — not addressed to avoid speculative rules |

## Recommendation

**READY_FOR_REVIEW_CREATE**

All 8 audited edge cases resolved without catalog-quality harm. Remaining WEAK rows are complex supplier-format lines outside this pass. Bidfood + Mammafiore + Bocconcino food rows are ready for bulk Review & Create validation in the UI.
