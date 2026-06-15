# Scorecard Comparison — Baseline / Phase 1 / Phase 2 / Final Cleanup

**Date:** 2026-06-15  
**Corpus:** 33 unmatched Review & Create VL rows  
**Final data:** `.tmp/final-canonical-cleanup/scorecard-final.json`

---

## Summary

| Milestone | EX | ACC | WEAK | EMPTY | Usable (EX+ACC) |
|-----------|----|----|------|-------|-----------------|
| **Baseline** | 2 | 7 | 10 | 14 | **9 (27.3%)** |
| **Phase 1** | 6 | 14 | 7 | 6 | **20 (60.6%)** |
| **Phase 2** | 6 | 19 | 4 | 4 | **25 (75.8%)** |
| **Final Cleanup** | **18** | **11** | **3** | **1** | **29 (87.9%)** |

**Final delta vs Phase 2:** +4 usable rows (+12.1 pp)

**Food rows only (excl. Recargo):** 29/32 usable (**90.6%**)

---

## Row-level transitions (Phase 2 → Final)

| Invoice | Phase 2 | Final | Suggested |
|---------|---------|-------|-----------|
| De Cecco - Paccheri Lisci Nr. 125 - 500g | EMPTY | **EXCELLENT** | Paccheri lisci |
| Baladin - Ginger Beer 0.20cl | EMPTY | **EXCELLENT** | Ginger beer |
| ACQUA S.PELLEGRINO (CX 75CL*15) | EMPTY | **ACCEPTABLE** | Água san pellegrino 75cl |
| Rulo Di Capra 1kg*2 Simonetta | WEAK | **EXCELLENT** | Rulo di capra |
| MOZZA Fior di Latte Expet Julienne 3kg Simonetta | WEAK | **EXCELLENT** | Mozzarella fior di latte julienne |
| Aceto balsamico di modena IGP pet 5l*2 Toschi | WEAK | **EXCELLENT** | Aceto balsamico di modena IGP |
| Farina do pasta fresca e gnocchi25kg Caputo | WEAK | **ACCEPTABLE** | Farina do pasta fresca e gnocchi |
| Recargo por combustibili | EMPTY | EMPTY | null *(excluded)* |
| Manteiga Coimbra… | ACCEPTABLE | EXCELLENT | Manteiga s/sal |
| Pêra Abacate Hasse | ACCEPTABLE | EXCELLENT | Pêra abacate |
| Salada Ibérica FSTK EMB. 250g | ACCEPTABLE | EXCELLENT | Salada ibérica |
| Ovo MORENO… | ACCEPTABLE | EXCELLENT | Ovo classe M |
| RICOTTA TREVIGIANA… | ACCEPTABLE | EXCELLENT | Ricotta trevigiana |
| POMODORI PELATI… | ACCEPTABLE | EXCELLENT | Pomodori pelati |
| STRACCIATELLA 250 GR | ACCEPTABLE | EXCELLENT | Stracciatella 250gr |
| MEZZI PACCHERI MANCINI… | ACCEPTABLE | ACCEPTABLE | Mezzi paccheri mancini |
| Arrigoni Gorgonzola… | ACCEPTABLE | **WEAK** | *(classifier — complex SKU line)* |
| Birra Peroni… | ACCEPTABLE | **WEAK** | Birra peroni nastro azzurro PNA 33cl nastro azzurro |
| Filete de Anchovas… | ACCEPTABLE | **WEAK** | *(supplier code L1 — out of scope)* |

---

## Remaining EMPTY (1)

| Invoice | Reason |
|---------|--------|
| Recargo por combustibili | Correct non-food exclusion |

---

## Remaining WEAK (3)

| Invoice | Notes |
|---------|-------|
| Arrigoni Formaggi - Gorgonzola DOP… | Complex Emporio SKU — out of scope |
| Birra Peroni Nastro Azzurro… | Duplicate brand token in suggestion — future noise pass |
| Filete de Anchovas Alconfirsta L1… | Supplier code L1 — out of scope |
