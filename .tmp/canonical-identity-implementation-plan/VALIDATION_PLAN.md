# Validation Plan

**Planning date:** 2026-06-15  
**Corpus:** Validation Lab invoices — Bidfood, Aviludo, Emporio, Bocconcino, Mammafiore

---

## VL invoice baseline

| Supplier | R&C rows | Baseline usable | Phase gate |
|----------|----------|-----------------|------------|
| **Bidfood** | 10 | 0% | Phase 1 ≥60%; Phase 3 ≥80% |
| **Bocconcino** | 6 | 66.7% | No regression; maintain ≥65% |
| **Emporio (live)** | 8 | 12.5% | Phase 3 before bulk; target ≥40% |
| **Aviludo April** | 1 | 0% | Phase 2; anchova brand strip |
| **Mammafiore** | 8 | 37.5% | Phase 2; no regression on ACCEPTABLE |

---

## Phase 1 success criteria

- [ ] `buildCanonicalIngredientCreateDefaults("Tomilho")` returns pre-fillable catalog-ready default (not null preview OR new `catalogReadyDefault` field)
- [ ] Submit still rejects confirmed name ≡ alias (except catalog-ready pass-through with explicit confirm)
- [ ] Bidfood herbs/produce (6 rows): EXCELLENT or ACCEPTABLE
- [ ] Bocconcino EX+ACC count unchanged (6/6 usable paths)
- [ ] R&C usable ≥ **42%** (14/33 minimum; target **45%**)
- [ ] No change to matcher scores on regression test suite

---

## Phase 2 success criteria

- [ ] Manteiga Coimbra: ≤1 noise token retained in suggestion
- [ ] Ovo MORENO: no MORENO, cartão, dúzias in suggestion
- [ ] Salada Ibérica: suggestion ≠ null; `Salada ibérica` without fstk/emb/250g
- [ ] Pêra Abacate Hasse: no `hasse` in suggestion
- [ ] Burger 90g vs 180g tests still pass (`canonical-ingredient-display-name.test.ts`)
- [ ] R&C usable ≥ **52%**; Bidfood ≥ **70%**
- [ ] Bocconcino: no regression from baseline 66.7%

---

## Phase 3 success criteria

- [ ] Manteiga → `Manteiga sem sal`
- [ ] Ovo → `Ovo classe M` (or kitchen-configurable `Ovo`)
- [ ] Confidence tier emitted for each suggestion (HIGH/MEDIUM/LOW)
- [ ] Reasoning payload: stripped vs kept attributes
- [ ] R&C usable ≥ **55%** (gate for Emporio bulk); stretch **60–65%**
- [ ] No new contamination in expansion sim (Mozzarella, Pepino families)
- [ ] Bidfood ≥ **80%**

---

## Execution method

1. Re-run scorecard against `.tmp/canonical-ingredient-identity-audit/scorecard-data.json` row list
2. Compare class transitions per row (EMPTY → EXCELLENT, WEAK → ACCEPTABLE, etc.)
3. Manual spot-check in Review & Create UI for Bidfood + Bocconcino
4. Run `vitest` on `canonical-ingredient-create.test.ts`, `canonical-ingredient-display-name.test.ts`
5. Re-run identity expansion simulation if Phase 3 touches cheese/produce categories

---

## Regression watchlist

| Test / scenario | Phase | Why |
|-----------------|-------|-----|
| ANGUS PTY → Angus patty | 1 | Must not break operational path |
| BAT shoestr → Batata shoestring | 1 | Shorthand expansion unchanged |
| 90g vs 180g burger identity | 2 | Gram preservation |
| Mozzarella fior di latte vs generic | 3 | No collapse |
| Bocconcino RICOTTA TREVIGIANA → Ricotta trevigiana | 2 | Must stay EXCELLENT |

---

## Go / no-go gates

| Milestone | Proceed if | Block if |
|-----------|------------|----------|
| Phase 1 → Phase 2 | ≥42% usable; Bidfood ≥60% | Bocconcino regression |
| Phase 2 → Phase 3 | ≥52% usable; Bidfood ≥70% | Gram/dimension test failures |
| Phase 3 → Emporio bulk R&C | ≥55% overall; expansion sim clean | Mozzarella collapse signals |
| Matching expansion | Pack variants + ≥60% + sim clean | Any contamination signal |
