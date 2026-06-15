# Implementation Notes — Phase 2

**Date:** 2026-06-15

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/canonical-ingredient-display-name.ts` | Noise tokens, phrases, multipack regex, produce gram context, `stripCatalogSupplierPackPhrases` |
| `src/lib/canonical-ingredient-operational-name.ts` | Pre-strip before `expandSupplierAbbreviations` (Metro Chef fix) |
| `src/lib/canonical-ingredient-display-name.test.ts` | Phase 2 example + regression tests |
| `src/lib/canonical-ingredient-create.test.ts` | Phase 2 integration tests, Pêra Abacate update |

---

## Tokens added/modified

**Phrases:** `metro chef`

**Tokens:** `coimbra`, `moreno`, `hasse`, `emb`, `fstk`, `cartao`, `cartão`, `duzias`, `dúzias`

**Rules:** multipack kg, cartão parens, cx.15, produce gram noise heads, token punctuation trim, pre-expansion phrase strip

**Not changed:** `OPERATIONAL_ALIASES` (matcher coupling avoided)

---

## Validated examples

| Invoice | Output |
|---------|--------|
| Manteiga Coimbra s/Sal EMB 1 Kg | Manteiga s/sal |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | Ovo classe M |
| Salada Ibérica FSTK EMB. 250g | Salada ibérica |
| Pêra Abacate Hasse | Pêra abacate |
| Arroz Agulha Metro Chef 12x1kg | Arroz agulha |

---

## Scope boundaries

- No `s/Sal` → `sem sal` (Phase 3)
- No matcher / pricing / schema changes
- No ontology categories
