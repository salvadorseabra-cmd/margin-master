# Validation Results — Phase 1

**Date:** 2026-06-15  
**Corpus:** 33 unmatched Review & Create rows from VL scorecard  
**Raw data:** `.tmp/phase1-empty-fix/scorecard-after-phase1.json`

---

## Scorecard comparison

| Class | Before | After | Δ |
|-------|--------|-------|---|
| EXCELLENT | 2 | 6 | +4 |
| ACCEPTABLE | 7 | 14 | +7 |
| WEAK | 10 | 7 | −3 |
| EMPTY | 14 | 6 | −8 |
| **Usable (EX+ACC)** | **9 (27.3%)** | **20 (60.6%)** | **+11** |

**Note:** Usable rate exceeds Phase 1 target (~45%) because some previously EMPTY rows now show non-null suggestions when normalized fold differs slightly (e.g. Birra Peroni → ACCEPTABLE). **Core Phase 1 win:** 6 Bidfood herbs/produce EMPTY → EXCELLENT.

---

## Rows flipped from EMPTY (Phase 1 target)

| Invoice | Before | After | catalogReady |
|---------|--------|-------|--------------|
| Tomilho | EMPTY | EXCELLENT | true |
| Manjericão | EMPTY | EXCELLENT | true |
| Hortelã | EMPTY | EXCELLENT | true |
| Alho Francês | EMPTY | EXCELLENT | true |
| Courgettes | EMPTY | EXCELLENT | true |
| Abóbora Butternut | EMPTY | EXCELLENT | true |

**6/6 target herbs/produce — success.**

---

## Side-effect flips (not Phase 1 target)

| Invoice | Before | After | Notes |
|---------|--------|-------|-------|
| Salada Ibérica FSTK EMB. 250g | EMPTY | WEAK | Suggestion visible; Phase 2 |
| Birra Peroni… | EMPTY | ACCEPTABLE | Normalization fold mismatch |

---

## Still EMPTY (expected)

| Invoice | Reason |
|---------|--------|
| Pêra Abacate Hasse | 3 tokens — not catalog-ready |
| De Cecco Paccheri… | Multi-token + digits |
| SanPellegrino, ACQUA S.PELLEGRINO | Pack notation |
| Baladin Ginger Beer | Specialty beverage |
| Recargo por combustibili | Non-ingredient |

---

## Bidfood subset (10 rows)

| Metric | Before | After |
|--------|--------|-------|
| Usable | 0/10 (0%) | **6/10 (60%)** |
| EMPTY herbs/produce | 6 | **0** |
| WEAK (Manteiga, Ovo) | 2 | 2 (unchanged — Phase 2) |

---

## vs Phase 1 plan target

| Metric | Planned | Actual |
|--------|---------|--------|
| R&C usable | ~45% (15/33) | **60.6%** (20/33) |
| Bidfood usable | ~60% | **60%** |
| Herb EMPTY fixes | 6 | **6** |

Exceeds plan on overall usable due to side-effect suggestion visibility; herb/produce target met exactly.
