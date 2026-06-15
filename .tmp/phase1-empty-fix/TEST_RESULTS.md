# Test Results — Phase 1

**Date:** 2026-06-15

---

## Test suites run

```bash
npx vitest run src/lib/canonical-ingredient-create.test.ts src/lib/bulk-canonical-ingredient-create.test.ts
```

**Result:** 39 tests passed

---

## New / updated tests

### `isCatalogReadyInvoiceName`

| Input | Expected |
|-------|----------|
| Tomilho, Manjericão, Hortelã, Alho Francês, Courgettes, Abóbora Butternut | `true` |
| ANGUS PTY, Óleo girassol fula 1L | `false` |
| Pêra Abacate Hasse, Salada Ibérica FSTK EMB. 250g | `false` |

### `buildCanonicalIngredientCreateDefaults` — catalog-ready herbs

| Invoice | `suggestedCanonicalName` | `catalogReady` |
|---------|-------------------------|----------------|
| Tomilho | Tomilho | true |
| Manjericão | Manjericão | true |
| Hortelã | Hortelã | true |
| Alho Francês | Alho francês | true |
| Courgettes | Courgettes | true |
| Abóbora Butternut | Abóbora butternut | true |

### Validation

| Case | Result |
|------|--------|
| Tomilho + alias Tomilho | `ok: true` |
| Óleo girassol fula 1L + same alias | `ok: false` (not catalog-ready) |
| ANGUS PTY | `ok: false` (shorthand) |

### Persist

| Case | Result |
|------|--------|
| `buildExplicitCanonicalInsertPayload` Tomilho/Tomilho | payload created, `name: Tomilho` |
| Óleo girassol fula 1L / same canonical | `null` |

### Regression (unchanged)

- ANGUS PTY → Angus patty suggestion
- BAT shoestr → Batata shoestring
- Batata palha alias regression
- CHK BREADED alias regression
