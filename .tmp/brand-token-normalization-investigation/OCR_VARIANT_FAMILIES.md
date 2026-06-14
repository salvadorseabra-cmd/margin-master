# OCR Variant Families — Validation Lab Alias Scan

**Investigation date:** 2026-06-14  
**Project:** `bjhnlrgodcqoyzddbpbd` (Validation Lab)  
**Data source:** `ingredient_aliases` where `confirmed_by_user = true` (live Supabase read-only query)

---

## Summary

| Metric | Value |
|--------|-------|
| Total confirmed aliases | **36** |
| Unique ingredients | **10** |
| Ingredients with 2+ aliases | **9** |
| Ingredients with multiple distinct normalized keys | **9** |
| OCR brand-noise families (edit-distance ≤3 on brand stem) | **8 ingredients, 33 aliases (92%)** |
| Whitespace-only differences | **0** — all drift is character-level OCR noise |

**Conclusion:** Brand-token OCR drift is **systemic**, not isolated to Anchoas. Every multi-alias ingredient except Chocolate culinária shows OCR-driven key fragmentation.

---

## Per-Ingredient Variant Families

| Ingredient | Aliases | Unique normalized keys | OCR-noise family? | Example variants |
|------------|---------|------------------------|-------------------|------------------|
| **Anchoas** | 10 | 10 | ✅ Worst case | Alconfrisa / Alconfi sta / Alconfrista / Alconfirosa / Alfonsoita / Alfoncisa … |
| **Pepino conserva** | 6 | 6 | ✅ | Pepin**so**, Extra VI**I**/U**LI**/L**ji**/U**il** |
| **Atum em óleo** | 6 | 6 | ✅ | Belo vs Bolsa/**Boisa**; Catri**neta**/**tineta**/**fratine** |
| **Nata culinária** | 3 | 3 | ✅ | Peny/**Remy** Picot; Culinária prefix drift |
| **Mozzarella fior di latte** | 2 | 2 | ✅ | Fior vs **Flor** |
| **Gema líquida** | 2 | 2 | ✅ | Gema vs **Gemo** |
| **Arroz agulha** | 2 | 2 | ⚠️ Format | `12x1 kg` vs `12x1kg` (Metro Chef) |
| **Açúcar branco** | 2 | 2 | ⚠️ Format | METRO Chef casing/spacing |
| **Chocolate culinária** | 2 | 2 | ❌ Structural | With/without `Culinaria` prefix (not OCR noise) |
| **Pepino fresco** | 1 | 1 | — | Stable (single alias) |

---

## Per-Supplier Grouping (multi-alias ingredients)

### Anchoas — AVILUDO (6 aliases, 6 unique keys)

Alconfrisa family — every OCR spelling stored as a separate confirmed alias:

| alias_name | normalized_alias |
|------------|------------------|
| Filete de Anchovas Alconfrisa Lt 495 g | `filete de anchovas alconfrisa 495` |
| Filete de Anchovas Alconfi sta Lt 495 g | `filete de anchovas alconfi sta 495` |
| Filete de Anchovas Alconfrista Lt 495 g | `filete de anchovas alconfrista 495` |
| Filete de Anchoas Alcoinfoosa L4 495 g | `filete de anchoas alcoinfoosa 495` |
| Filete de Anchovas Alconfiosa L 495 g | `filete de anchovas alconfiosa 495` |
| Filete de Anchoas Alconfitosa L4 495 g | `filete de anchoas alconfitosa 495` |

### Anchoas — AVIJUDO (4 aliases, 4 unique keys)

Alfonsoita family — separate supplier scope, same whack-a-mole pattern:

| alias_name | normalized_alias |
|------------|------------------|
| Filete de Anchoas Alfonsoita L4 495 g | `filete de anchoas alfonsoita 495` |
| Filete de Anchoas Alfoncisa L4 495 g | `filete de anchoas alfoncisa 495` |
| Filete de Anchoas Alfonsica L4 495 g | `filete de anchoas alfonsica 495` |
| Filete de Anchoas Alcoinfiosa L4 495 g | `filete de anchoas alcoinfiosa 495` |

### Pepino conserva — BIDFOOD (6 aliases, 6 unique keys)

OCR garbles the Extra VII suffix and product name:

- `pepinos extra vii` / `pepinos extra uli` / `pepinos extra lji` / `pepinos extra uil`
- `pepino` (bare word — appears stable only because OCR returns the short form)
- `pepinoso` (character transposition)

### Atum em óleo — NAU (6 aliases, 6 unique keys)

Two packaging paths with brand OCR drift:

- **Belo path:** `atum oleo belo catrieta` / `atum oleo belo catrietta` / `atum oleo belo catarina`
- **Bolsa path:** `atum oleo bolsa catrieta` / `atum oleo boisa catrieta` / `atum oleo bolsa catri netta fratine`

### Nata culinária — PANTAGRUEL (3 aliases, 3 unique keys)

- `nata culinaria reny picot` / `nata culinaria remy picot` / `nata reny picot` (prefix drift)

### Mozzarella fior di latte — METRO CHEF (2 aliases, 2 unique keys)

- `mozzarella fior di latte` / `mozzarella flor di latte`

### Gema líquida — DOVO (2 aliases, 2 unique keys)

- `ovo liquido past gema` / `ovo liquido past gemo`

### Arroz agulha — METRO CHEF (2 aliases, 2 unique keys)

- `arroz agulha metro chef 12x1 kg` / `arroz agulha metro chef 12x1kg` (format spacing only)

### Açúcar branco — METRO CHEF (2 aliases, 2 unique keys)

- `acucar branco metro chef` / `acucar branco metrochef` (casing/spacing)

### Chocolate culinária — METRO CHEF (2 aliases, 2 unique keys)

- `chocolate culinaria metro chef` / `chocolate metro chef` (structural — prefix presence, not OCR noise)

---

## OCR Stability Run Analysis

Source: `.tmp/vl-ocr-rc/ocr-stability-runs.json`

### Anchovas line spellings across repeated reads of the same PDF

- **14 unique OCR line spellings** for the Anchovas product across stability runs
- After space-collapse on brand token: **12 unique forms**
- After edit-distance ≤2 clustering on brand stems: **~5 clusters**

Example brand tokens extracted from OCR stability runs:

| Brand token (as OCR'd) | Occurrences |
|------------------------|-------------|
| Alconfrisa | most common |
| Alconfrista | frequent |
| Alconfirosa | post-hardening stable |
| Alconfi sta | split-token variant |
| Alconfirsta | character substitution |
| Alcofiorisa | transposition |
| Alconfi osa | split-token variant |

**Insight:** The same physical invoice line produces a different brand token on nearly every OCR run. The exact-key alias model stores each spelling as a separate row, but can never keep pace with future OCR output.

---

## Classification of Multi-Alias Ingredients

| Category | Ingredients | Notes |
|----------|-------------|-------|
| **Brand OCR noise** (edit-dist ≤3) | Anchoas, Pepino conserva, Atum, Nata, Mozzarella, Gema | 6 ingredients — core problem |
| **Format spacing** | Arroz agulha, Açúcar branco | Collapsible via space-normalization |
| **Structural diff** | Chocolate culinária | Prefix presence — different product description |
| **Single alias (stable)** | Pepino fresco | No drift observed |

---

## Candidate Canonical Brand Tokens

| Family | Supplier | Proposed canonical | Current aliases | Collapse target |
|--------|----------|-------------------|-----------------|-----------------|
| Alconfrisa | AVILUDO | `alconfrisa` | 6 | 1 per supplier |
| Alfonsoita | AVIJUDO | `alfonsoita` | 4 | 1 per supplier |
| Pepino Extra | BIDFOOD | `extra` (+ roman numeral bucket) | 6 | 1–2 |
| Atum Nau | NAU | `nau` + packaging stem | 6 | 2 (Belo vs Bolsa paths) |
| Metro Chef | METRO CHEF | `metrochef` | 4 (Arroz + Açúcar) | 2 |
| Mozzarella | METRO CHEF | `fiordilatte` | 2 | 1 |
| Pantagruel | PANTAGRUEL | `pantagruel` | 3 | 1 |
| Gema | DOVO | `gema` | 2 | 1 |

**Estimated collapse:** 36 aliases → **~14–16 canonical keys** (save ~20 rows).
