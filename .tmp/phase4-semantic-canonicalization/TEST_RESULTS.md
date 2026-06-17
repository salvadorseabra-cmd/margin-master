# Test Results — Phase 4 Semantic Canonicalization

**Date:** 2026-06-16

## Suite run

```bash
npm test -- --run \
  src/lib/canonical-ingredient-display-name.test.ts \
  src/lib/canonical-ingredient-create.test.ts \
  src/lib/canonical-ingredient-operational-name.test.ts \
  src/lib/canonical-ingredient-quality.test.ts
```

| Result | Count |
|--------|------:|
| Test files | 4 passed |
| Tests | **106 passed** |
| Failures | 0 |

## New coverage

### `canonical-ingredient-display-name.test.ts` — `phase 4 semantic canonicalization`
- Emporio charcuterie brand prefix strip (Rovagnati, Rigamonti, Arrigoni Formaggi)
- Procurement/commercial code strip (Assaporami, HC, PNA, wheel fractions, 15ud)
- Distributor suffix strip (Amoruso, Sorrentino, Alconfirsta/L1)
- Regression anchors (herbs, Paccheri, Ginger beer, Pellegrino 75cl, MOZZA julienne path, etc.)

### `canonical-ingredient-create.test.ts`
- Updated Produto de Stock + San Pellegrino Emporio line expectation (15ud removed)
- Phase 4 create-defaults for Ventricina, Bresaola, Peroni

## Regression note
Initial `+/` drop regex accidentally removed bilingual `/` separators (CHK BREADED). Narrowed to explicit `+/-` and `+/` tokens only.
