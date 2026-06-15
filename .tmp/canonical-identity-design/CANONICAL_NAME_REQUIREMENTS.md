# Canonical Name Requirements

**Investigation date:** 2026-06-15  
**Type:** Design specification — read-only

---

## Characteristics of a good canonical name

| Requirement | Rationale | Marginly evidence |
|-------------|-----------|-------------------|
| **Human-readable** | Chefs pick ingredients in recipe UI | `formatCanonicalIngredientDisplayName`, readability scoring in `canonical-ingredient-quality.ts` |
| **Portuguese culinary vocabulary** | Primary market is PT foodservice | Validation Lab Bidfood produce names are already PT |
| **Supplier/packaging independent** | Same product, different invoices | Weak suggestions retain Coimbra, MORENO, FSTK, EMB |
| **Recipe-friendly** | Short enough for recipe lines, clear in margin alerts | Recipe picker merges ingredients + prep recipes |
| **Purchasing-aware but not pack-specific** | Costing uses purchase fields, not name | `invoice-purchase-format.ts` separates identity from pack |
| **Distinct where kitchen meaning differs** | Prevent Mozzarella/Pepino-style collapse | Identity expansion simulation |
| **Validatable** | Must differ from invoice alias on submit (except pass-through categories) | `validateCanonicalIngredientName` in `canonical-ingredient-create.ts` |

---

## Explicit rules

### MUST include

- Core culinary noun (Manteiga, Ovo, Tomilho)
- Meaningful variety or form when it changes kitchen use (sem sal, fior di latte, cherry, pelati)
- Protected operational shorthand when industry-standard (palha, angus patty) — see `PROTECTED_OPERATIONAL_SHORTHAND`

### MUST NOT include

- Supplier brands (Coimbra, MORENO, Hasse, Metro Chef) unless brand defines product category (rare)
- Packaging codes (EMB, FSTK, Cx, cartão, dúzias)
- Bulk pack weights (1 Kg, 2Kg, 12x1kg) — lives in purchase fields
- OCR artifacts, SKU fragments, supplier line metadata

### MAY include (category-dependent)

- Grade/class when operationally distinct (Ovo classe M vs L — if kitchen tracks)
- Origin/variety names that are culinary (Abóbora butternut, Pêra abacate)
- DOP/IGP when part of product identity (Gorgonzola DOP — not full supplier line name)

---

## Case study: `Manteiga Coimbra s/Sal EMB 1 Kg`

| Option | Canonical name | Assessment |
|--------|----------------|------------|
| **A** | Manteiga | Too generic — loses unsalted distinction; kitchen may stock both salted and unsalted |
| **B** | Manteiga sem sal | **Recommended** — culinary attribute preserved; brand and pack stripped |
| **C** | Manteiga sem sal 1kg | Wrong layer — 1kg is purchase format, already in `purchase_quantity` / `purchase_unit` |
| **D** | Manteiga Coimbra sem sal | Pollutes catalog with supplier brand; future supplier breaks deduplication |

**Current system output:** `Manteiga coimbra s/sal emb` (WEAK)  
**Target:** Option B

**Reasoning:** Marginly separates identity from pack. `s/Sal` is a culinary attribute (unsalted butter). `Coimbra` is a supplier brand. `EMB` and `1 Kg` are packaging. Purchase fields capture pack and price from the invoice line.

---

## Name length guidance

| Tier | Example | When |
|------|---------|------|
| Single noun | Tomilho, Courgette | Commodity herbs/produce |
| Noun + variety | Abóbora butternut, Pêra abacate | Culinary variety matters |
| Noun + form | Manteiga sem sal, Tomate pelati | Form changes kitchen use |
| Noun + type | Mozzarella fior di latte | Product type is identity, not brand |

Avoid: supplier prefix + long SKU string (Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG)

---

## Relationship to `normalized_name`

- **Display name (`name`):** Title-cased, human-readable — shown in UI and recipes
- **Normalized key (`normalized_name`):** Lowercase, accent-stripped — used for deduplication and matching keys
- Both derive from the same canonical identity decision; neither should carry pack or supplier noise
