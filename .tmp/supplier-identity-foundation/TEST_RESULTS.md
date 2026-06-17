# Test Results — Supplier Identity Foundation

**Date:** 2026-06-16

## New tests: `src/lib/supplier-identity.test.ts`

| Case | Result |
|---|---|
| `AVILUDO` → display `Aviludo` | PASS |
| `IL BOCCONCINO DISTRIBUIÇÃO ALIMENTAR` → title case | PASS |
| `Bidfood Portugal, SA` → `Bidfood Portugal` | PASS |
| `Avijudo` → key `aviludo` | PASS |
| Aviludo/Avijudo alias lookup unification | PASS |
| Watchlist merges AVILUDO + Aviludo | PASS |

## Updated tests

| File | Change | Result |
|---|---|---|
| `ingredient-alias-lookup.test.ts` | Key now lowercase (`metro::…`) | PASS (9/9) |
| `ingredient-alias-fuzzy-lookup.test.ts` | Cross-supplier uses BIDFOOD; added Avijudo recovery case | PASS (15/15) |

## Supplier-related suite run

```bash
npm test -- src/lib/supplier-identity.test.ts \
  src/lib/ingredient-alias-lookup.test.ts \
  src/lib/ingredient-alias-fuzzy-lookup.test.ts
```

**Result:** 3 files, 33 tests, all passed.

## Related test (not modified)

`ingredient-price-history-linked.test.ts` — `buildOperationalAlertItems` atum alert assertion failed in isolated run (pre-existing alert threshold logic; unrelated to supplier key wiring). `buildSupplierWatchlist` test in same file passed.

## Coverage summary

- Display normalization: ALL-CAPS, legal suffix strip, accent preservation
- Key normalization: lowercase fold, typo map, suffix strip
- Integration: alias lookup + watchlist aggregation
