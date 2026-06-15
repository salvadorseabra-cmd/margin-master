# Test Results — Final Canonical Cleanup

**Date:** 2026-06-15

---

## Command

```bash
npm test -- src/lib/canonical-ingredient-display-name.test.ts \
              src/lib/canonical-ingredient-create.test.ts \
              src/lib/canonical-ingredient-operational-name.test.ts
```

## Result

```
Test Files  3 passed (3)
     Tests  78 passed (78)
  Duration  ~1–2s
```

## New / updated test coverage

| Area | Tests |
|------|-------|
| Simonetta / Caputo / Toschi removal | `final cleanup edge cases` in display-name.test.ts |
| De Cecco / Baladin prefix strip | display-name.test.ts |
| San Pellegrino preservation | display-name.test.ts |
| MOZZA → Mozzarella + fior di latte | operational-name.test.ts + create.test.ts |
| Recargo exclusion | create.test.ts (`isNonFoodInvoiceLine`) |
| Phase 1/2 regressions | Existing tests unchanged and passing |

## Regression checks (manual via test suite)

- Mozzarella Fior di Latte — preserved
- Angus PTY → Angus patty — preserved
- Batata palha — preserved
- Salada Ibérica — preserved
- Tomilho / Manjericão / Hortelã — catalog-ready preserved
