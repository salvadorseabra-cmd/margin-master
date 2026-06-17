# Final Recommendation — Canonical Semantic Audit

**Date:** 2026-06-15

---

## Six questions answered

| # | Question | Answer |
|---|----------|--------|
| 1 | Biggest remaining semantic problems? | Emporio charcuterie brand prefixes, wheel fractions, supplier codes, marketing lines |
| 2 | Tokens always strip? | Rovagnati, Rigamonti, Arrigoni, Assaporami, HC, PNA, 1/2, 1/8, distributor suffixes |
| 3 | Tokens always keep? | San Pellegrino, Peroni, DOP/IGP, oro, scelto, massima, punta d'anca, 75cl/33cl |
| 4 | Highest ROI next improvement? | Charcuterie/cheese brand prefix strip (5 rows) |
| 5 | Limited by semantic understanding? | **Yes** — remaining debt is brand vs culinary grade, not OCR/packaging |
| 6 | Recommendation | **`IMPLEMENT_SEMANTIC_CANONICALIZATION_PHASE`** (scoped, ~2–3 days) |

---

## STOP_CLEANUP vs IMPLEMENT

| | STOP_CLEANUP | IMPLEMENT (scoped) |
|---|--------------|-------------------|
| Launch | ✅ Manual edit ~8–10 rows | ✅ Also viable |
| Catalog at scale | Debt compounds in browse UX | Deterministic rules mirror De Cecco/Baladin |
| Risk | Low | Low for charcuterie/fractions/codes |
| Effort | 0 | ~2–3 days |

**Launch path:** Review & Create ready **now** with manual edits.

**Optional Phase 4:** Brand prefix strip + wheel fractions + HC/PNA/Assaporami/15ud + Peroni dedupe + Pellegrino polish.

**Do not:** Full Italian ontology, strip beverage brands, collapse fior di latte, speculative OCR.

---

## Code gap

`INVOICE_BRAND_PREFIX_STRIP_RE` covers De Cecco/Baladin only. Rovagnati/Rigamonti/Arrigoni intentionally retained — contradicts Italian catalog quality audits. Primary implementation target: `canonical-ingredient-display-name.ts`.
