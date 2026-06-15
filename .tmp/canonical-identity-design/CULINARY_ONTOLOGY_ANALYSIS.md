# Culinary Ontology Analysis

**Investigation date:** 2026-06-15  
**Type:** Design analysis — read-only

---

## Why ontology is needed

Current Review & Create suggestions perform **string cleanup**, not **culinary classification** (prior audit: root cause D). Token lists in `CATALOG_NOISE_TOKENS` are retailer-focused (Continente, Auchan), not foodservice-produce focused.

Partial ontology exists in the **matching** pipeline (`FAMILY_TOKEN_TO_ID`, `FORM_TOKEN_TO_ID` in `src/lib/ingredient-identity.ts`) but is **not wired into Review & Create suggestions**.

---

## Would ontology improve canonical quality?

**Yes — high impact on EMPTY and WEAK rows.**

| Segment | Today | Estimated after ontology + normalization |
|---------|-------|------------------------------------------|
| Bidfood unmatched (10 rows) | 0% usable | ~50–60% usable |
| All unmatched VL (33 rows) | 27% usable | ~55–65% usable |
| Herbs/produce EMPTY rows | 100% empty | Pass-through pre-fill |

Ontology is the only path to fix simple produce names (Tomilho) and semantic dairy/egg lines (Manteiga sem sal, Ovo classe M) without manual entry on every row.

---

## Recommended top-level categories

| Category | VL examples | Canonicalization need |
|----------|-------------|----------------------|
| **Fresh herbs** | Tomilho, Manjericão, Hortelã | Pass-through names; guard UX fix |
| **Fresh produce** | Courgettes, Alho Francês, Abóbora Butternut | Variety folding rules |
| **Dairy** | Manteiga, Mozzarella Fior di Latte, Nata | Form/fat/type attributes |
| **Eggs** | Ovo MORENO Classe M | Strip brand/channel; optional grade |
| **Proteins** | Angus patty, Guanciale | Operational expansion works well today |
| **Dry goods** | Arroz agulha, Farine speciale pizza | Strip brand unless product-defining |
| **Prepared/cured** | Prosciutto, Mortadella IGP | Preserve cure/type; strip supplier line |
| **Beverages** | Birra Peroni 33cl | Keep serving format; strip pack counts |
| **Non-food** | Recargo combustível | Exclude from ingredient catalog |
| **Cleaning/packaging** | — | Separate catalog or exclude entirely |

---

## Missing culinary knowledge today

1. **Herb/produce pass-through** — good names nulled by alias guard
2. **Egg taxonomy** — brand MORENO ≠ product type; Classe M is operational grade
3. **Butter taxonomy** — s/Sal, com sal, manteiga culinária
4. **Cheese taxonomy** — fior di latte vs mozzarella vs bufala (contamination risk #1 in expansion simulation)
5. **Salad mixes** — Ibérica = variety; FSTK = supplier code
6. **Rice/flour grades** — agulha, especial pizza = meaningful; Metro Chef = brand noise
7. **PT/EN produce synonyms** — Courgettes vs curgete (normalization, not separate canonicals)

---

## Ontology scope recommendation

### Phase 1 seed map (minimum viable)

- Herbs → pass-through
- Fresh produce → variety rules
- Eggs → strip brand/channel; optional grade
- Dairy butter/cream → form rules (sem sal, culinária)
- Cheese → fior di latte, stracciatella, ricotta, gorgonzola

### Defer

Full hierarchical taxonomy (species → variety → cultivar). Marginly needs **operational culinary classes**, not a botanical database.

---

## Ontology vs normalization

| Approach | Handles | Does not handle |
|----------|---------|-----------------|
| Normalization only | Token stripping, title case | Semantic "s/Sal → sem sal", egg grade decisions |
| Ontology | Category-aware canonical templates | Novel products outside seed map |
| Both (recommended) | Complete coverage for VL invoice mix | Requires curation over time |

Ontology should **inform** normalization (category-specific strippers), not replace it.
