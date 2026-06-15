# Final Implementation Recommendation

**Planning date:** 2026-06-15  
**Type:** Implementation sequencing — read-only, no code changes  
**Builds on:** Canonical identity audit, design investigation, phased analysis

---

## Answers

### 1. What should be implemented first?

**Phase 1 — Guard UX** in `canonical-ingredient-create.ts` + dialog/sheet components.

Pre-fill catalog-ready names for herbs and simple produce. Keep `validateCanonicalIngredientName` submit block for true shorthand.

---

### 2. What produces the highest ROI?

**Phase 1:** +18 percentage points usable for ~3–5 days effort.

Fixes entire Bidfood herb/produce segment (6/10 rows) with zero matcher or normalization risk.

---

### 3. What is the safest first change?

**Phase 1 only.**

Zero changes to `cleanCanonicalIngredientNameForCatalog`, `ingredient-identity.ts`, or `ingredient-canonical.ts`. UI and defaults logic only.

---

### 4. What should be postponed?

| Item | Why |
|------|-----|
| Full culinary ontology | Seed 5 categories in Phase 3 first |
| Pack variant schema (`pack_variant_id`) | Required before matching expansion on Mozzarella family |
| Emporio bulk Review & Create | 12.5% baseline usable |
| Syncing ontology into matcher | HIGH matching regression risk |
| LLM canonical suggestions | Breaks determinism and test guarantees |
| Metro Chef tokenization bug fix | Separate from R&C unmatched scope |

---

### 5. Does any phase require schema changes?

| Phase | Schema required? |
|-------|------------------|
| 1 — Guard UX | **No** |
| 2 — Normalization | **No** |
| 3 — Ontology seed | **No** (TypeScript rule map) |
| Future pack variants | **Yes** — deferred |

All three phases are implementable as TypeScript + tests only.

---

### 6. What is the expected quality after each phase?

| Milestone | R&C usable (33 rows) | Bidfood usable (10 rows) |
|-----------|----------------------|--------------------------|
| **Today** | 27.3% | 0% |
| **Phase 1** | ~45% | ~60% |
| **Phase 1+2** | ~55–58% | ~70–80% |
| **Phase 1+2+3** | ~60–65% | ~80–90% |

---

### 7. At what point is Review & Create safe to scale?

| Gate | Scope | Threshold |
|------|-------|-----------|
| **Now** | Bocconcino shorthand only | 66.7% usable (proven) |
| **After Phase 1** | Bidfood herbs + simple produce | ≥60% on Bidfood subset |
| **After Phase 2** | Bidfood dairy/eggs + Aviludo | ≥70% Bidfood |
| **After Phase 3** | Bidfood + Emporio dry/dairy | ≥55% overall R&C |
| **Before matching expansion** | All VL | Pack variant layer + ≥60% + contamination sim clean |

---

## Final recommended roadmap

```
Week 1     Phase 1 → Guard UX pre-fill (catalog-ready pass-through)
Week 2–3   Phase 2 → CATALOG_NOISE_TOKENS + emb fix + produce gram rules
Week 3–4   Phase 3 → 5-category ontology seed (herbs, produce, eggs, dairy, cheeses)
Gate       Re-score VL → ≥55% usable before Emporio bulk Review & Create
Defer      Pack variants, matcher ontology sync, LLM suggestions
```

**Sequence:** Option A (EMPTY fixes → noise cleanup → ontology seed) — highest quality gain per effort unit, lowest risk ordering.

---

## Deliverables index

| File | Content |
|------|---------|
| `PHASED_ROADMAP.md` | Option A/B/C evaluation |
| `PHASE_1_EMPTY_FIX_ANALYSIS.md` | Guard UX scope and estimates |
| `PHASE_2_NOISE_CLEANUP_ANALYSIS.md` | Token cleanup opportunities |
| `PHASE_3_CULINARY_ONTOLOGY_SEED_ANALYSIS.md` | Minimal 5-category seed |
| `RISK_ASSESSMENT.md` | Per-phase LOW/MED/HIGH |
| `MATCHING_SAFETY_ANALYSIS.md` | Isolation from matcher pipeline |
| `VALIDATION_PLAN.md` | Per-phase success criteria |
| `BEFORE_AFTER_SCORECARD_ESTIMATES.md` | Quantitative projections |

---

## One-line summary

Implement **Phase 1 guard UX first** (safest, highest ROI), then **normalization tokens**, then **minimal ontology seed** — all without schema changes — and gate Emporio bulk Review & Create at **≥55% usable**.
