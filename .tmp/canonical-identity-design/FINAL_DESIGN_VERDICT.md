# Final Design Verdict

**Investigation date:** 2026-06-15  
**Workspace:** `/Users/salvadorseabra1/margin-master`  
**Type:** Design & architecture — read-only, no implementation  
**Builds on:** [Canonical identity audit](../canonical-ingredient-identity-audit/FINAL_VERDICT.md)

---

## Verdict

Define and implement **Hybrid Option D — culinary-operational canonicals with attributes on purchase/alias layers** before large-scale Review & Create.

---

## 1. What should a canonical ingredient represent?

The **stable culinary-operational product** a restaurant stocks, costs in recipes (including prep recipes), and matches across supplier invoices — **not** the supplier's SKU string.

> Canonical = "What is this in my kitchen?"  
> Alias = "How did this supplier label it?"

---

## 2. What information should be removed?

Always remove from the canonical name:

- Supplier brands (Coimbra, MORENO, Hasse, Metro Chef) unless brand defines product category
- Packaging codes (EMB, FSTK, Cx, cartão, dúzias)
- Bulk pack sizes (1 Kg, 2Kg, 12x1kg, 250g on produce)
- SKU fragments (Nr. 125, 1/8, weight ranges)
- Retailer and OCR noise

Route removed attributes to purchase fields, alias memory, or future attribute tags.

---

## 3. What information should be preserved?

Always or conditionally preserve:

- Core ingredient noun (Manteiga, Ovo, Tomilho, Mozzarella)
- Culinary forms that change kitchen use (sem sal, fior di latte, pelati)
- Meaningful varieties (butternut, abacate, ibérica salad mix)
- Operational grades where kitchen-relevant (classe M)
- Protected shorthand (palha, angus patty)
- Beverage serving formats (33cl, 75cl)

---

## 4. What catalog philosophy should Marginly adopt?

**Hybrid D** with **Option B naming depth** as default:

| Layer | Holds |
|-------|-------|
| Canonical name | Culinary-operational identity |
| Purchase fields | Pack, unit, price |
| Alias memory | Full invoice text per supplier |
| Future pack variants | Same canonical, different pack/price |
| Optional tags | Brand, channel — intelligence only |

Examples: `Manteiga sem sal`, `Ovo classe M`, `Mozzarella fior di latte`, `Tomilho`

Not: `Manteiga Coimbra s/Sal EMB 1 Kg`, `Ovo`, `Ovo branco MORENO`

---

## 5. What architecture best supports matching, purchasing, recipes, prep recipes, and supplier intelligence?

**Layered deterministic architecture:**

1. Normalization (extend existing token strippers)
2. Culinary ontology (category + seed rules — new)
3. Canonical generation with confidence + reasoning (extend `buildCanonicalIngredientCreateDefaults`)
4. User correction loop (Review & Create, quality queue, correction memory)
5. Alias memory (existing)
6. Pack variants (future — required before matching expansion)

Keep matching identity (`ingredient-identity.ts`) and catalog display (`canonical-ingredient-display-name.ts`) separate. Do not use LLM for suggestions without explicit product decision to sacrifice determinism.

---

## 6. What should happen before large-scale Review & Create?

**IMPROVE_CANONICALS_FIRST** — confirmed by both audits.

| Evidence | Value |
|----------|-------|
| Usable suggestions (unmatched VL) | 27.3% today |
| Bidfood unmatched usable | 0% |
| EMPTY rate | 42.4% |
| Contamination risk (expansion sim) | Mozzarella, Pepino families |
| Target after phased fix | 55–65% usable |

### Phased gate

| Phase | Scope unlocked |
|-------|----------------|
| After Phase 1 (guard UX + pass-through) | Bidfood herbs/produce |
| After Phase 2 (normalization) | Branded dairy/eggs |
| After Phase 3 (ontology) | Bidfood, Emporio bulk |
| Now (unchanged) | Bocconcino shorthand only (~67% usable) |

---

## Deliverables index

| File | Content |
|------|---------|
| `CANONICAL_IDENTITY_PRINCIPLES.md` | Purpose and domain roles |
| `CANONICAL_NAME_REQUIREMENTS.md` | Explicit naming rules |
| `CULINARY_ONTOLOGY_ANALYSIS.md` | Category needs and scope |
| `ATTRIBUTE_CLASSIFICATION_FRAMEWORK.md` | Remove/keep/routing rules |
| `CATALOG_DESIGN_OPTIONS.md` | Options A–D comparison |
| `EXAMPLE_TRANSFORMATIONS.md` | VL examples with ideal outputs |
| `REVIEW_CREATE_FUTURE_UX.md` | Target Review & Create experience |
| `ARCHITECTURE_RECOMMENDATION.md` | Target-state layer model |

---

## One-line summary

Marginly's canonical layer should name **culinary-operational kitchen products** — not supplier SKUs — using a **hybrid catalog model** with deterministic ontology-backed generation, before expanding Review & Create beyond shorthand-heavy invoices.
