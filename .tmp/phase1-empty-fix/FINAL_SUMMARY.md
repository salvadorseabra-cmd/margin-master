# Final Summary — Phase 1 Empty Fix

**Date:** 2026-06-15  
**Status:** Complete

---

## What was done

Implemented Phase 1 only: catalog-ready invoice names (simple herbs/produce) now show suggestions, pre-fill the confirmed field, and display a **Catalog Ready** badge. Submit validation remains intact for shorthand and noisy lines.

---

## 1. Files changed

| File | Change |
|------|--------|
| `src/lib/canonical-ingredient-create.ts` | `isCatalogReadyInvoiceName`, `catalogReady`, guard + validation |
| `src/components/canonical-ingredient-create-dialog.tsx` | Pre-fill, badge, UX copy |
| `src/components/bulk-canonical-ingredient-create-sheet.tsx` | Catalog Ready badge |
| `src/lib/canonical-ingredient-create.test.ts` | 6 herb tests + validation/persist updates |

---

## 2. Tests added/updated

- 39 tests passing (`canonical-ingredient-create.test.ts`, `bulk-canonical-ingredient-create.test.ts`)
- New: `isCatalogReadyInvoiceName` for 6 herbs + rejections
- New: catalog-ready defaults for Tomilho through Abóbora Butternut
- Updated: validation allows catalog-ready ≡ alias; persist creates Tomilho payload
- Regression: ANGUS PTY, BAT shoestr, alias memory flows unchanged

---

## 3. Validation results

| Metric | Before | After |
|--------|--------|-------|
| Usable (33 unmatched) | 27.3% | **60.6%** |
| EMPTY | 14 | **6** |
| Bidfood usable | 0% | **60%** |
| Target herbs fixed | 0/6 | **6/6** |

---

## 4. Updated scorecard estimate

**Core Phase 1 (herbs/produce only):** 6 EMPTY → EXCELLENT, Bidfood 0% → 60%.

**Overall VL unmatched:** 27.3% → 60.6% usable (+11 rows). Exceeds ~45% target due to incidental suggestion visibility on 2 non-herb lines.

---

## 5. Risks discovered

| Risk | Severity | Mitigation |
|------|----------|------------|
| Salada Ibérica shows WEAK suggestion | Low | Phase 2 noise cleanup |
| Birra Peroni now ACCEPTABLE with noise | Low | Phase 2/3 |
| 2-token limit may miss 3-word produce | Low | Phase 2 ontology |
| No matching/pricing regression | — | Verified isolated path |

---

## Success criteria checklist

- [x] EMPTY herbs/produce show suggestions
- [x] Catalog-ready names prefilled
- [x] Validation intact for shorthand/noisy lines
- [x] No schema changes
- [x] No matching changes
- [x] No pricing/purchase unit changes
- [x] No ontology / Phase 2 work

---

## Next step

**Phase 2:** Noise cleanup (`CATALOG_NOISE_TOKENS`, `emb` fix) for Manteiga Coimbra, Ovo MORENO, Salada Ibérica, Pêra Abacate Hasse.
