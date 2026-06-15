# Before / After Scorecard Estimates

**Planning date:** 2026-06-15  
**Source:** `.tmp/canonical-ingredient-identity-audit/scorecard-data.json` (33 unmatched Review & Create rows)

---

## Baseline (today)

| Class | n | % |
|-------|---|---|
| EXCELLENT | 2 | 6.1% |
| ACCEPTABLE | 7 | 21.2% |
| WEAK | 10 | 30.3% |
| EMPTY | 14 | 42.4% |
| **Usable (EX+ACC)** | **9** | **27.3%** |

**Bidfood (10 rows):** 0% usable, 80% empty, 20% weak

---

## Phase 1 only

**Assumption:** Guard UX pre-fills 6 catalog-ready EMPTY rows as EXCELLENT; no other rows change.

| Class | n | Δ |
|-------|---|---|
| EXCELLENT | 8 | +6 |
| ACCEPTABLE | 7 | — |
| WEAK | 10 | — |
| EMPTY | 8 | −6 |
| **Usable** | **15** | **+6 → 45.5%** |

| Supplier | Usable before | Usable after |
|----------|---------------|--------------|
| Bidfood | 0/10 (0%) | **6/10 (60%)** |
| Bocconcino | 4/6 (66.7%) | 4/6 (unchanged) |
| Emporio | 1/8 (12.5%) | 1/8 (unchanged) |

**Range:** 44–46% (14–15/33)

---

## Phase 1 + 2

**Assumption:** Phase 2 flips Manteiga, Ovo, Salada, Pêra (+2 WEAK from brand strips on Mammafiore/Emporio).

| Class | n |
|-------|---|
| EXCELLENT | 9 |
| ACCEPTABLE | 10 |
| WEAK | 6 |
| EMPTY | 8 |
| **Usable** | **19 → 57.6%** |

| Supplier | Usable after |
|----------|--------------|
| Bidfood | **7–8/10 (70–80%)** |
| Bocconcino | 4–5/6 (maintain) |
| Emporio | 2–3/8 |

**Range:** 55–58% (18–19/33) if Manteiga stays ACCEPTABLE not EXCELLENT

---

## Phase 1 + 2 + 3

**Assumption:** Ontology polishes Manteiga sem sal, courgette singular, 1–2 additional WEAK→ACC.

| Class | n |
|-------|---|
| EXCELLENT | 10–11 |
| ACCEPTABLE | 10–12 |
| WEAK | 4–6 |
| EMPTY | 6–8 |
| **Usable** | **20–22 → 61–67%** |

| Supplier | Usable after |
|----------|--------------|
| Bidfood | **8–9/10 (80–90%)** |
| Bocconcino | 4–5/6 |
| Emporio | 3–4/8 (~40%) |

**Conservative target:** **60–65%** (aligned with design audit)

---

## Cumulative gain summary

| Milestone | Usable % | Δ from baseline | Bidfood % |
|-----------|----------|-----------------|-----------|
| Baseline | 27.3% | — | 0% |
| Phase 1 | ~45% | +18 pp | ~60% |
| Phase 1+2 | ~56% | +29 pp | ~75% |
| Phase 1+2+3 | ~63% | +36 pp | ~85% |

---

## Rows likely remaining weak/empty after all phases

| Row | Reason |
|-----|--------|
| Emporio Rovagnati/Rigamonti cured meats | Brand-defining; human judgment |
| Recargo por combustibili | Non-ingredient |
| De Cecco Paccheri Nr. 125 | Pasta SKU rules out of seed scope |
| Birra Peroni PNA 33cl*24 | Beverage duplication noise |
| Baladin Ginger Beer | Specialty beverage |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Pack-only cleanup insufficient |

---

## Assumptions and limitations

- Estimates based on deterministic re-scoring of 33 unmatched VL rows
- Human classification rubric from prior audit (noise token retention, strip ratio)
- Emporio gains are conservative — bulk create still not recommended until ≥40% supplier usable
- Does not account for new invoices outside VL corpus
