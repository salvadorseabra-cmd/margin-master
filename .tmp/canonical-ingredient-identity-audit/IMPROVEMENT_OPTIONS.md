# Improvement Options

**Audit date:** 2026-06-15  
**Constraint:** Options only — no implementation in this audit

---

## Option A — Prompt-only improvement

| Dimension | Assessment |
|-----------|------------|
| **Effort** | N/A — no prompt exists in suggestion path |
| **Risk** | N/A |
| **Expected quality gain** | **0%** |

Adding an LLM prompt for canonical naming would be a **new feature**, not a prompt fix. Would require new infrastructure (API call, latency, cost, non-determinism) in `buildCanonicalIngredientCreateDefaults`.

**Not recommended** as Option A — the current architecture is intentionally deterministic.

---

## Option B — Normalization rules before generation

Extend `cleanCanonicalIngredientNameForCatalog` and related token lists.

| Dimension | Assessment |
|-----------|------------|
| **Effort** | **Medium** (1–2 weeks) |
| **Risk** | **Low–medium** — regression on working shorthand paths |
| **Expected quality gain** | **+15–25 pp** usable (EX+ACC) |

### Proposed changes

1. Add supplier brand tokens to `CATALOG_NOISE_TOKENS`: coimbra, moreno, hasse, simonetta, etc.
2. Add packaging/channel tokens: fstk, emb, cartão, dúzias, s/sal, ssal
3. Fix `OPERATIONAL_ALIASES.emb` — map to empty/strip or `"embalado"` removal
4. Category-aware gram stripping — drop 250g+ on produce/salad, keep on differentiated SKUs
5. Expand `CATALOG_NOISE_PHRASES` for common supplier prefixes

### Pros
- Fits existing architecture
- Deterministic, testable
- Low latency

### Cons
- Whack-a-mole without ontology
- Will not fix simple produce EMPTY (Tomilho) without guard UX change

---

## Option C — Culinary canonicalization layer

New semantic layer mapping invoice descriptions to canonical culinary identities.

| Dimension | Assessment |
|-----------|------------|
| **Effort** | **High** (3–5 weeks) |
| **Risk** | **Medium** — wrong mappings propagate to catalog |
| **Expected quality gain** | **+25–35 pp** usable (EX+ACC) |

### Proposed design

```
invoice line
  → category classifier (herb / produce / dairy / egg / meat / …)
  → category-specific canonicalizer
  → cleanCanonicalIngredientNameForCatalog (existing)
  → formatCanonicalIngredientDisplayName
```

### Seed mappings (examples)

| Pattern | Canonical |
|---------|-----------|
| `/^Tomilho$/i` | Tomilho |
| `/Ovo\s+MORENO/i` | Ovo |
| `/Abóbora\s+Butternut/i` | Abóbora |
| `/Manteiga.*s\/Sal/i` | Manteiga sem sal |
| `/Salada\s+Ibérica/i` | Salada ibérica |

### Pros
- Addresses produce/herb EMPTY and branded product WEAK
- Highest ceiling for catalog quality

### Cons
- Maintenance burden (new mappings over time)
- Requires category taxonomy decisions

---

## Option D — Hybrid approach (B + C + guard UX fix)

Combine normalization expansion with culinary ontology and UX guard refinement.

| Dimension | Assessment |
|-----------|------------|
| **Effort** | **High** (3–4 weeks phased) |
| **Risk** | **Medium** |
| **Expected quality gain** | **+30–40 pp** usable → **~55–65% EX+ACC** |

### Phased rollout

1. **Phase 1 (quick win):** Guard UX — pre-fill simple produce names even when ≡ alias; keep submit validation
2. **Phase 2:** Normalization token expansion (Option B)
3. **Phase 3:** Culinary seed map for top categories: herbs, produce, eggs, dairy

### Pros
- Addresses all three failure modes (EMPTY, WEAK, shorthand)
- Phased delivery allows incremental Validation Lab re-runs

### Cons
- Largest engineering investment
- Requires ongoing ontology curation

---

## Recommendation

**Option D (Hybrid)** — phased implementation:

| Phase | Deliverable | Expected usable rate |
|-------|-------------|---------------------|
| Today | — | ~27% (unmatched VL) |
| Phase 1 (guard UX) | Simple produce pre-fill | ~45% |
| Phase 2 (normalization) | Brand/pack stripping | ~55% |
| Phase 3 (ontology) | Category canonicalizers | ~60–65% |

Option B alone insufficient for Bidfood produce. Option C alone misses packaging token cleanup on complex lines. Hybrid delivers best ROI for Review & Create workflow.
