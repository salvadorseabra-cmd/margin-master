# Regression Test Results — Phase 2

**Date:** 2026-06-15

```bash
npx vitest run src/lib/canonical-ingredient-create.test.ts \
  src/lib/canonical-ingredient-display-name.test.ts \
  src/lib/bulk-canonical-ingredient-create.test.ts
```

**Result:** 59 tests passed

---

## Regressions checked

| Case | Expected | Status |
|------|----------|--------|
| Mozzarella Fior di Latte 2Kg | Mozzarella fior di latte | Pass |
| Batata palha | Batata palha | Pass |
| Salada Ibérica (after cleanup) | Salada ibérica | Pass |
| ANGUS PTY → Angus patty | Unchanged | Pass |
| BAT shoestr → Batata shoestring | Unchanged | Pass |
| 90g vs 180g burger weights | Preserved | Pass |
| Guardanapo 33x33 dimensions | Preserved | Pass |
| Alias memory regressions | Pass | Pass |

---

## New Phase 2 tests

- `phase 2 noise cleanup` describe block in display-name tests (5 audit examples + regressions)
- `strips phase 2 noise from weak canonical examples` in create tests
- `suggests cleaned name for Pêra Abacate Hasse after brand strip`
