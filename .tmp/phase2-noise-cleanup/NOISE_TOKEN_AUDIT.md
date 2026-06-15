# Noise Token Audit — Phase 2

**Date:** 2026-06-15

---

## Layers traced

| Layer | File | Role |
|-------|------|------|
| `CATALOG_NOISE_PHRASES` | `canonical-ingredient-display-name.ts` | Multi-word supplier phrases |
| `CATALOG_NOISE_TOKENS` | `canonical-ingredient-display-name.ts` | Single-token removal in `shouldDropCatalogToken` |
| `OPERATIONAL_ALIASES` | `ingredient-operational-aliases.ts` | Shorthand expansion (matching + operational path) |
| `removeCatalogNoisePhrases()` | display-name | Phrase stripping |
| `shouldDropCatalogToken()` | display-name | Per-token drop decision |
| `stripCatalogSupplierPackPhrases()` | display-name (new) | Pre-expansion strip for operational path |

**Not modified:** `COMMERCIAL_NOISE_TOKENS` in `ingredient-identity.ts` (matcher — out of scope).

---

## Tokens that existed before Phase 2

### Phrases
`food service`, `pingo doce`, `top down`, `oliveira da serra`, `continente`, `auchan`

### Single tokens
`cx`, `caixa`, `caixas`, `pack`, `heinz`, `continente`, `auchan`, retailer noise — **not** foodservice brands (Coimbra, MORENO, Hasse, Metro Chef).

### Operational
`emb: "emb"` — identity no-op; did not strip from catalog names.

---

## Tokens missing (audit targets)

| Token | Survived in | Root cause |
|-------|-------------|------------|
| Coimbra | Manteiga suggestion | Not in noise set |
| MORENO | Ovo suggestion | Not in noise set |
| Metro Chef | Arroz suggestion | Not in phrases; **Chef** corrupted to cheddar via operational expansion |
| Hasse | Pêra suggestion | Not in noise set |
| EMB / emb. | Manteiga, Salada | Not in noise set; punctuation on `EMB.` |
| FSTK | Salada | Not in noise set |
| Cartão | Ovo | Not in noise set; parens pattern incomplete |
| Dúzias | Ovo | Not in noise set |
| 250g on salad | Salada | Operational gram preservation without produce context |
| 12x1kg | Arroz | Multipack pattern not stripped |

---

## Phase 2 additions

### `CATALOG_NOISE_PHRASES`
- `metro chef`

### `CATALOG_NOISE_TOKENS`
- `coimbra`, `moreno`, `hasse`, `emb`, `fstk`, `cartao`, `cartão`, `duzias`, `dúzias`

### Regex / rules
- `PACKAGING_ONLY_PAREN_RE` — `(cartão)` / `(cartao)`
- `CX_COUNT_PHRASE_RE` — `cx.15` optional dot
- `MULTIPACK_KG_RE` — `12x1kg` style packs
- `CATALOG_GRAM_PACK_NOISE_HEADS` — drop grams on salada/produce heads
- Trailing punctuation strip on tokens (`EMB.`)
- Lone `x` debris token drop
- `stripCatalogSupplierPackPhrases()` before operational abbreviation expansion

### Explicitly NOT added
- `classe` (needed for Ovo Classe M)
- `ibérica` / `iberica` (salad variety)
- `s/sal` → `sem sal` (Phase 3 ontology)
