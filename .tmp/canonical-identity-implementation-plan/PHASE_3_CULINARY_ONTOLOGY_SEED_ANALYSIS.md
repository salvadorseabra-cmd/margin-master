# Phase 3 — Culinary Ontology Seed Analysis

**Planning date:** 2026-06-15  
**Scope:** Minimal high-impact seed — NOT full ontology

---

## Five-category seed set

| Category | Seed rules (examples) | VL rows affected |
|----------|----------------------|------------------|
| **Herbs** | Pass-through + title case + confidence HIGH | Tomilho, Manjericão, Hortelã (Phase 1 covers UX; ontology adds confidence/reasoning) |
| **Produce** | Variety keep: butternut, abacate; singular courgette | Abóbora Butternut, Courgettes, Pêra abacate |
| **Eggs** | Strip brand; keep classe M optionally | Ovo MORENO → `Ovo classe M` or `Ovo` |
| **Dairy** | `s/Sal` → `sem sal`; strip distributor brand | Manteiga Coimbra → `Manteiga sem sal` |
| **Cheeses** | Keep fior di latte, DOP; strip pack kg | Mozzarella Fior di Latte 2Kg (already ACCEPTABLE) |

---

## Proposed integration point

Insert **before** `cleanCanonicalIngredientNameForCatalog` in `buildCanonicalIngredientCreateDefaults`:

```
invoiceAlias
 → detectCategory(invoiceAlias)          // new: canonical-ingredient-ontology.ts
 → applyCategoryCanonicalRules(...)      // seed map (~30–50 rules)
 → cleanCanonicalIngredientNameForCatalog  // existing
 → formatCanonicalIngredientDisplayName
 → guard UX (Phase 1)
```

Seed from `FAMILY_TOKEN_TO_ID` patterns in `ingredient-identity.ts` — extend for catalog generation, do not replace matcher families.

---

## Expected gain vs effort

| Dimension | Assessment |
|-----------|------------|
| Effort | **MEDIUM–HIGH** — ~1–2 weeks for 5-category seed |
| Rows flipped beyond Phase 2 | +2–4 (Manteiga sem sal, Ovo polish, courgette convention) |
| R&C usable after Phase 1+2+3 | **60–65%** (20–22/33) |
| Bidfood after Phase 1+2+3 | **80–90%** (8–9/10) |
| Maintenance | Ongoing curation from correction memory |
| Schema changes | **None** — in-memory TypeScript rule map |

---

## What is explicitly out of scope

- Full hierarchical taxonomy (species → variety → cultivar)
- Emporio cured-meat brand disambiguation (Rovagnati, Rigamonti)
- Pasta SKU rules (De Cecco Nr. 125)
- Beverage duplication cleanup (Birra Peroni)
- Syncing ontology into `canonicalizeIngredientIdentity` (HIGH matching risk)

---

## Risk level: **MEDIUM**

- Wrong category rule propagates to catalog via `buildCatalogIngredientIdentity` on confirm.
- Collapse risk: Mozzarella vs Mozzarella fior di latte (identity expansion simulation).
- Mitigation: confidence tiers (HIGH/MEDIUM/LOW); no bulk auto-create on LOW.

---

## ROI relative to Phase 1 and 2

| Phase | Marginal usable gain | Effort |
|-------|---------------------|--------|
| 1 | +18 pp | 3–5 days |
| 2 | +10–13 pp | 1–2 weeks |
| 3 | +5–8 pp | 1–2 weeks |

Phase 3 has **lower marginal ROI** but required for semantic transforms (sem sal, classe M policy) that token lists cannot express reliably.
