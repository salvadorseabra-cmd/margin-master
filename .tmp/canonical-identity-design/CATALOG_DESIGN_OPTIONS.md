# Catalog Design Options

**Investigation date:** 2026-06-15  
**Type:** Design comparison — read-only

---

## Options overview

Four catalog philosophies for how Marginly should name and structure canonical ingredients.

---

## Option A — Ultra-generic

**Example:** `Ovo`, `Manteiga`, `Mozzarella`

| Pros | Cons |
|------|------|
| Maximum deduplication | Loses grade/form distinctions kitchen may need |
| Simple recipe picker | Historical pricing mixes Classe M/L purchases |
| Easy matching | Identity expansion simulation warns collapse on differentiated products (Mozzarella fior di latte vs generic) |

**Verdict:** Wrong for Marginly. Prep recipes and supplier intelligence need more granularity than single-noun commodities.

---

## Option B — Operational

**Example:** `Ovo classe M`, `Manteiga sem sal`, `Arroz agulha`

| Pros | Cons |
|------|------|
| Matches how kitchens order | Brand noise still pollutes if not stripped |
| Supports price comparison by grade | More catalog rows to maintain |
| Aligns with supplier invoice structure | May over-split (Classe M vs cartão vs bulk) |

**Verdict:** Good default for commodities with operational grades. Aligns with existing purchase field separation.

---

## Option C — Culinary

**Example:** `Ovo branco classe M`, `Manteiga culinária sem sal`, `Mozzarella fior di latte`

| Pros | Cons |
|------|------|
| Rich kitchen vocabulary | MORENO/branco confusion — brand ≠ color |
| Clear in recipes | Longer names in picker |
| | Risk of duplicating Option B with different adjectives |

**Verdict:** Use only when culinary attribute is real (branco vs marrom eggs), not when it mirrors supplier branding.

---

## Option D — Hybrid (canonical + attributes) ✅ RECOMMENDED

**Example structure:**

| Layer | Holds | Example |
|-------|-------|---------|
| **Canonical name** | Culinary-operational identity | `Ovo classe M`, `Manteiga sem sal`, `Mozzarella fior di latte` |
| **Purchase fields** | Pack size, unit price, purchase_unit | 1 cx, €38.44, kg |
| **Alias memory** | Full invoice text per supplier | `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` |
| **Future pack variants** | Same canonical, different pack/price | Mozzarella 125g vs 2Kg |
| **Optional attribute tags** | Brand, supplier, channel | For intelligence, not matching keys |

| Pros | Cons |
|------|------|
| Matches existing architecture separation | Requires ontology investment |
| Prevents Mozzarella/Pepino collapse | More complex mental model for operators |
| Best Review & Create UX (clean name + visible pack) | Phased delivery needed |
| Deterministic and testable | |

**Verdict:** Recommended. Aligns with prior audit Hybrid Option D and existing code separation between catalog identity, purchase format, and alias memory.

---

## Comparison matrix

| Criterion | A Generic | B Operational | C Culinary | D Hybrid |
|-----------|-----------|---------------|------------|----------|
| Recipe clarity | Low | Medium | High | High |
| Deduplication | High | Medium | Low | Medium |
| Matching safety | Low | Medium | Medium | High |
| Review & Create efficiency | Medium | High | Medium | High |
| Pack variant support | Poor | Good | Good | Best |
| Implementation effort | Low | Medium | High | High |
| Contamination risk | High | Medium | Medium | Low |

---

## Marginly-specific recommendation

Adopt **Option D** with **Option B naming depth** as default:

- Canonical names are culinary-operational (not ultra-generic, not over-adjective)
- Pack, brand, channel live outside the name
- Category rules determine when form/grade/variety enters the canonical vs attribute layer

This matches how Marginly already separates concerns in code — the gap is incomplete rules, not wrong architecture.
