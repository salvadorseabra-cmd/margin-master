# Test Results — Phase 1B

**Date:** 2026-06-14

## Unit Tests

### `ingredient-alias-fuzzy-lookup.test.ts` (14 tests)

| Test | Result |
|------|--------|
| Brand fingerprint extraction (anchoas stems) | ✅ |
| Anchovas/anchoas prefix compatibility | ✅ |
| Levenshtein ≤2 for close variants | ✅ |
| Recovers alconfrista from cluster | ✅ |
| Recovers alconfirosa from cluster | ✅ |
| Recovers alconfirsta from cluster | ✅ |
| Rejects cross-supplier recovery | ✅ |
| Rejects pepino ↔ pepino conserva | ✅ |
| Rejects atum ↔ atum em óleo | ✅ |
| Rejects arroz ↔ arroz agulha | ✅ |
| Rejects ambiguous cross-ingredient tie | ✅ |
| Integration: alconfirosa invoice line | ✅ |
| Integration: alconfirsta invoice line | ✅ |
| Integration: pepino false-positive guard | ✅ |

### Related suites (76 tests total)

```
npx vitest run src/lib/ingredient-alias src/lib/ingredient-match-override src/lib/ingredient-operational-alias-memory
→ 9 files, 76 passed
```

### `ingredient-operational-alias-memory.test.ts` (17 tests)

All Phase 1 normalization tests still pass — no regressions.

## Validation Script

```bash
npx vite-node scripts/validate-brand-token-variants.mts all
```

| Check | Result |
|-------|--------|
| Anchoas recovery | **6/7** |
| False positives | **0** |
| Cross-ingredient collisions | **0** |
| Cross-ingredient regressions (key migration) | **0** |
| Verdict | **SUCCESS** |

## Pre-existing Failures (unrelated)

Full `npx vitest run` reports 13 failures in `operational-intelligence-synthesis.test.ts` — pre-existing, not caused by Phase 1B changes.
