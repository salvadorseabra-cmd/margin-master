# Weak Canonical Audit

**Audit date:** 2026-06-15  
**Method:** Step-by-step trace through `buildCanonicalIngredientCreateDefaults` with live output

---

## Summary table

| Invoice | Suggested (live) | Retained brand | Retained packaging | Retained quantity | Retained supplier |
|---------|------------------|----------------|--------------------|--------------------|-------------------|
| Manteiga Coimbra s/Sal EMB 1 Kg | `Manteiga coimbra s/sal emb` | **Coimbra** | **s/sal**, **emb** | ~~1 Kg~~ stripped | — |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | `Ovo moreno classe M dúzias cartão` | **MORENO** | **cartão** | ~~Cx.15~~ stripped | grade **M**, **dúzias** |
| Salada Ibérica FSTK EMB. 250g | `Salada ibérica fstk emb 250g` → **null** | **Ibérica** | **fstk**, **emb** | **250g** kept | — |

---

## 1. Manteiga Coimbra s/Sal EMB 1 Kg

### Path taken

1. `looksLikeInvoiceShorthandName` → false
2. `looksLikeSupplierAbbreviatedCatalogName` → false (no resolvable alias tokens; `emb` maps to itself)
3. Path: **`formatCanonicalIngredientDisplayName`**

### Token-by-token trace

| Token | Action | Mechanism |
|-------|--------|-----------|
| `Manteiga` | Kept | Product identity |
| `Coimbra` | **Kept** | Not in `CATALOG_NOISE_TOKENS` or `CATALOG_NOISE_PHRASES` |
| `s/Sal` | **Kept** | Not recognized as noise; not in noise set |
| `EMB` / `emb` | **Kept** | `OPERATIONAL_ALIASES.emb = "emb"` — identity mapping, not expansion (`ingredient-operational-aliases.ts:59`) |
| `1 Kg` | **Stripped** | `BULK_ATTACHED_KG_RE` in `cleanCanonicalIngredientNameForCatalog` |

### Expected vs actual

| Ideal canonical | Actual |
|-----------------|--------|
| `Manteiga sem sal` | `Manteiga coimbra s/sal emb` |

**Root cause:** Missing brand token (`coimbra`) and packaging token (`emb`, `s/sal`) in normalization layer. Bulk kg correctly stripped but semantic cleanup insufficient.

---

## 2. Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)

### Path taken

1. `looksLikeInvoiceShorthandName` → likely **true** (mixed case + supplier codes) OR `looksLikeSupplierAbbreviatedCatalogName` → true via resolvable tokens
2. Path: **`generateOperationalIngredientName`** → `expandSupplierAbbreviations` → `formatCanonicalIngredientDisplayName`

### Token-by-token trace

| Token | Action | Mechanism |
|-------|--------|-----------|
| `Ovo` | Kept | Product identity |
| `MORENO` | **Kept** | Brand/grade signal not in noise lists |
| `Classe` | Kept | |
| `M` | **Kept** | In `DISPLAY_ACRONYM_ALLOWLIST` — preserved uppercase (`canonical-ingredient-display-name.ts:6-16`) |
| `Cx.15` | **Stripped** | `PACKAGING_ONLY_PAREN_RE` / `CX_COUNT_PHRASE_RE` |
| `dúzias` | **Kept** | Not in noise tokens |
| `CARTÃO` | **Kept as `cartão`** | Lowercased; channel/packaging token not in `CATALOG_NOISE_TOKENS` |

Parenthetical `(CARTÃO)` partially cleaned; count phrase removed but channel word retained.

### Expected vs actual

| Ideal canonical | Actual |
|-----------------|--------|
| `Ovo` | `Ovo moreno classe M dúzias cartão` |

**Root cause:** Operational path expands shorthand tokens but has no culinary ontology for eggs (brand MORENO, grade M, pack channel). Grade `M` explicitly preserved by acronym allowlist.

---

## 3. Salada Ibérica FSTK EMB. 250g

### Path taken

1. Display cleanup path (not shorthand)
2. `cleanCanonicalIngredientNameForCatalog` → `formatCanonicalIngredientDisplayName`

### Token-by-token trace

| Token | Action | Mechanism |
|-------|--------|-----------|
| `Salada` | Kept | Product identity |
| `Ibérica` | **Kept** | Brand/variety not in noise lists |
| `FSTK` / `fstk` | **Kept** | Supplier code; not in `OPERATIONAL_ALIASES` or noise tokens |
| `EMB` / `emb` | **Kept** | Identity-mapped alias (`emb: "emb"`) |
| `250g` | **Kept** | `isOperationalGramToken` → preserved as product identity (`canonical-ingredient-display-name.ts:78-84, 141-145`) |

### Guard outcome

After title-case: `"Salada ibérica fstk emb 250g"`  
After `normalizeIngredientName` fold: `"salada iberica fstk emb 250g"` ≡ invoice → **suggestion nulled**

UI shows **empty**, but if guard did not apply the weak suggestion would be visible.

### Expected vs actual

| Ideal canonical | Actual (before guard) |
|-----------------|----------------------|
| `Salada ibérica` or `Salada` | `Salada ibérica fstk emb 250g` |

**Root cause:** `fstk`, `emb`, and operational gram `250g` not stripped for salad/produce category. Missing culinary context (pack weight vs product identity).

---

## Shared weak-suggestion patterns

1. **Brand tokens survive cleanup** — `CATALOG_NOISE_PHRASES` only covers retail chains (Continente, Auchan, Pingo Doce), not supplier brands (Coimbra, MORENO, Hasse, Ibérica).
2. **Packaging tokens partially handled** — `cx`, `caixa`, `pack` in noise set; `emb`, `fstk`, `cartão`, `dúzias` are not.
3. **`emb` is a no-op alias** — expands to itself, so lines containing EMB never trigger operational path improvements.
4. **Operational gram preservation** — correct for differentiated products (90g vs 180g) but wrong for bulk produce/salad where weight is pack noise.
5. **Acronym allowlist** — preserves `M`, `L`, `S` size grades that should be stripped for eggs/produce.
