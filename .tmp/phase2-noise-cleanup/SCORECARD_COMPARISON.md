# Scorecard Comparison — Baseline / Phase 1 / Phase 2

**Date:** 2026-06-15  
**Corpus:** 33 unmatched Review & Create VL rows  
**Phase 2 data:** `.tmp/phase2-noise-cleanup/scorecard-phase2.json`

---

## Summary

| Milestone | EX+ACC usable | EMPTY | WEAK |
|-----------|---------------|-------|------|
| **Baseline** | 9 (27.3%) | 14 | 10 |
| **Phase 1** | 20 (60.6%) | 6 | 7 |
| **Phase 2** | **25 (75.8%)** | **4** | **4** |

**Phase 2 delta vs Phase 1:** +5 usable rows (+15.2 pp)

---

## Key row-level changes (Phase 2)

| Invoice | Phase 1 | Phase 2 |
|---------|---------|---------|
| Manteiga Coimbra s/Sal EMB 1 Kg | WEAK | **ACCEPTABLE** (`Manteiga s/sal`) |
| Ovo MORENO Classe M… | WEAK | **ACCEPTABLE** (`Ovo classe M`) |
| Salada Ibérica FSTK EMB. 250g | WEAK/EMPTY | **ACCEPTABLE** (`Salada ibérica`) |
| Pêra Abacate Hasse | EMPTY | **ACCEPTABLE** (`Pêra abacate`) |
| Farina… Caputo | WEAK | **ACCEPTABLE** (Simonetta/Caputo stripped) |
| MOZZA… Simonetta | WEAK | **ACCEPTABLE** |

---

## Remaining EMPTY (4)

- De Cecco Paccheri (pasta SKU — Phase 3)
- SanPellegrino / ACQUA S.PELLEGRINO (beverage pack)
- Baladin Ginger Beer
- Recargo por combustibili (non-ingredient)

---

## Remaining WEAK (4)

- Emporio Rovagnati/Rigamonti cured meats (brand-defining lines)
- Farina do pasta… Caputo (partial)
- Filete de Anchovas (supplier code L1)
- Arrigoni Gorgonzola (complex SKU line)

---

## Bidfood subset

| Metric | Baseline | Phase 1 | Phase 2 |
|--------|----------|---------|---------|
| Usable | 0/10 | 6/10 | **9/10 (90%)** |

Only Manteiga + Ovo were WEAK/ACCEPTABLE improvements; herbs from Phase 1 retained.
