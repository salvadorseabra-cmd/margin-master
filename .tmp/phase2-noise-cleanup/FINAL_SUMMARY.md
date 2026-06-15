# Final Summary — Phase 2 Noise Cleanup

**Date:** 2026-06-15  
**Status:** Complete

---

## 1. Files changed

- `src/lib/canonical-ingredient-display-name.ts`
- `src/lib/canonical-ingredient-operational-name.ts`
- `src/lib/canonical-ingredient-display-name.test.ts`
- `src/lib/canonical-ingredient-create.test.ts`

---

## 2. Tokens added

**Phrase:** `metro chef`

**Tokens:** `coimbra`, `moreno`, `hasse`, `emb`, `fstk`, `cartao`, `cartão`, `duzias`, `dúzias`

**Rules:** multipack kg strip, cartão parens, cx.15, produce gram noise, `stripCatalogSupplierPackPhrases()` before operational expansion

---

## 3. Tests

59 tests passing including 5 audit examples and Mozzarella/Batata/Angus regressions.

---

## 4. Scorecard

| | Usable |
|---|--------|
| Baseline | 27.3% |
| Phase 1 | 60.6% |
| **Phase 2** | **75.8%** |

---

## 5. Unexpected findings

- **Metro Chef → metro cheddar** required pre-strip before operational expansion, not display cleanup alone.
- **`EMB.`** needed punctuation trim on tokens.
- **Arroz** used operational path due to alias expansion side effects.

---

## 6. Phase 3 readiness

**Ready to begin Phase 3** for:

- `s/Sal` → `sem sal` (Manteiga)
- Emporio cured-meat disambiguation
- Remaining EMPTY beverage/pasta lines

**Gate met:** 75.8% usable exceeds Phase 2 target (~55–58%). Bidfood at 90% usable.

**Do not** sync ontology into matcher. Pack-variant work remains separate for matching expansion.
