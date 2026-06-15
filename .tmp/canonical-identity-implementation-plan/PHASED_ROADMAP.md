# Phased Roadmap

**Planning date:** 2026-06-15  
**Type:** Implementation planning — read-only, no code changes  
**Builds on:** `.tmp/canonical-ingredient-identity-audit/`, `.tmp/canonical-identity-design/`

---

## Sequencing options evaluated

| Option | Sequence | Quality gain / effort | Risk | Verdict |
|--------|----------|----------------------|------|---------|
| **A** | EMPTY/guard UX → noise cleanup → ontology seed | **Highest** — fixes 42% EMPTY bucket first with ~3–5 days work | LOW | **Recommended** |
| **B** | Noise cleanup first | Medium — fixes WEAK (30%) but leaves 42% EMPTY untouched | LOW–MED | Suboptimal |
| **C** | Ontology first | Low per effort — high build cost before fixing guard UX | MED | Suboptimal |

---

## Why Option A wins

1. **Largest empty bucket is a UX gap, not missing logic.** `confirmedNameMatchesInvoiceAlias` in `canonical-ingredient-create.ts:174-178` nulls suggestions where cleanup ≡ invoice. Six Bidfood herbs/produce lines are already excellent catalog names.
2. **Bidfood is 80% EMPTY.** Phase 1 alone unlocks 6/10 Bidfood rows without touching normalization.
3. **Noise cleanup (B first) cannot fix Tomilho.** `formatCanonicalIngredientDisplayName` only title-cases; no tokens to strip → guard still nulls.
4. **Ontology (C first) is overkill for pass-through herbs** and still needs Phase 2 for FSTK/EMB/250g on Salada Ibérica.
5. **Risk ordering:** UX-only → token lists → semantic rules matches ascending blast radius.

---

## Recommended phased roadmap

```
Week 1   Phase 1 — Guard UX + catalog-ready pre-fill
Week 2–3 Phase 2 — Normalization token expansion
Week 3–4 Phase 3 — Culinary ontology seed (5 categories)
Gate     Re-run scorecard; ≥55% usable before Emporio bulk R&C
```

**Re-validation gate after each phase:** Live `buildCanonicalIngredientCreateDefaults` against VL extracts (Bidfood, Aviludo, Emporio, Bocconcino).

---

## Phase summary

| Phase | Scope | Effort | R&C usable (33 rows) | Bidfood (10 rows) |
|-------|-------|--------|----------------------|-------------------|
| Baseline | — | — | **27.3%** (9/33) | **0%** (0/10) |
| 1 | Pre-fill catalog-ready names; keep submit validation | ~3–5 days | **~45%** (15/33) | **~60%** (6/10) |
| 2 | Extend noise tokens, fix `emb`, category gram rules | ~1–2 weeks | **~55–58%** (18–19/33) | **~70–80%** (7–8/10) |
| 3 | Seed ontology: herbs, produce, eggs, dairy, cheeses | ~1–2 weeks | **~60–65%** (20–22/33) | **~80–90%** (8–9/10) |

---

## What each phase does NOT touch

| Phase | Out of scope |
|-------|--------------|
| 1 | Normalization tokens, matcher, ontology |
| 2 | Full ontology, pack variants, matcher sync |
| 3 | Full taxonomy, Emporio cured-meat automation, LLM suggestions |

---

## Dependencies

```
Phase 1 (independent)
    ↓
Phase 2 (benefits from Phase 1 UX but technically independent)
    ↓
Phase 3 (requires Phase 2 noise stripping for clean ontology input)
```

Phase 3 semantic rules (s/Sal → sem sal) are ineffective if Phase 2 still leaves EMB/FSTK on the line.
