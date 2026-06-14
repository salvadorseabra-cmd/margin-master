# Phase 1 Regression Audit

**Date:** 2026-06-14  
**Validation:** `npx vite-node scripts/validate-brand-token-variants.mts regression`

---

## Result: PASS — No cross-ingredient regressions

| Check | Result |
|-------|--------|
| Total confirmed aliases | 36 |
| Keys unchanged | 20 |
| Keys re-normalized | 16 |
| Cross-ingredient regressions | **0** |

---

## Unit Test Regression

| Suite | Result |
|-------|--------|
| `ingredient-operational-alias-memory.test.ts` | 17/17 pass |
| `ingredient-match-override.test.ts` | pass |
| `ingredient-alias-lookup.test.ts` | pass |

New tests cover: `alconfi sta`, `alconfrista` separation, `metro chef`, `12x1 kg`.

---

## Pre-existing Failures (unchanged)

| Test | Status |
|------|--------|
| `CHED TOP matches Molho Cheddar Dispensador` | Still fails on main — unrelated operational matching issue |

Verified: failure reproduces with pre-change `normalizeOperationalAliasKey`; not introduced by Phase 1.

---

## Behavioral Guards Verified

| Scenario | Expected | Actual |
|----------|----------|--------|
| `alconfrista` stays distinct from `alconfista` | ✅ | ✅ |
| `cheddar top` does not become `cheddartop` | ✅ | ✅ |
| `HMB 180` shorthand unchanged | ✅ | ✅ |
| `PICKL SLC 1KG` unchanged | ✅ | ✅ |
| Exact-key lookup remains primary | ✅ | ✅ — no fuzzy fallback added |

---

## Write/Read Path Consistency

Both paths call `normalizeOperationalAliasKey` via `buildOverrideKeysFromInvoiceLine`:

- **Write:** `rememberIngredientMatchOverride`, alias persist queue
- **Read:** `lookupIngredientIdFromAliasMap`, `resolveNormalizedAliasFromConfirmedRow`, `hydrateOperationalAliasMemoryFromConfirmedMap`

No divergent key builders introduced.
