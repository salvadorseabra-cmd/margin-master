# Phase 1 Test Results

**Date:** 2026-06-14

---

## Unit Tests

```bash
npx vitest run src/lib/ingredient-operational-alias-memory.test.ts
```

**Result:** 17/17 passed

### New test cases

| Case | Assertion |
|------|-----------|
| `alconfi sta` | → `filete de anchovas alconfista 495` |
| `alconfrista` vs `alconfi sta` | Distinct keys (`alconfrista` ≠ `alconfista`) |
| `metro chef` | → `acucar branco metrochef` |
| `12x1 kg` | → `arroz agulha metrochef 12x1kg` |
| `normalizeBrandToken(["alconfi","sta"])` | → `["alconfista"]` |
| `normalizeBrandToken(["metro","chef"])` | → `["metrochef"]` |
| `normalizeBrandToken(["12x1","kg"])` | → `["12x1kg"]` |
| Stop-word guard (`filete de anchovas`) | No joins |

---

## Integration Tests

```bash
npx vitest run src/lib/ingredient-match-override.test.ts src/lib/ingredient-alias-lookup.test.ts
```

**Result:** All passed

---

## Live Validation (Supabase VL)

```bash
npx vite-node scripts/validate-brand-token-variants.mts all
```

```json
{
  "anchoas": { "exact_hit_rate": "3/7" },
  "recovery": {
    "phase1_exact": "3/7",
    "prior_db_exact": "2/7",
    "space_collapse": "3/7",
    "fuzzy_ed2": "6/7"
  },
  "alias_collapse": {
    "keys_changed": 16,
    "unique_before": 36,
    "unique_after": 34,
    "collapse_delta": 2
  },
  "pepino": { "exact_hits": "0/4", "keys_changed": 6 },
  "regression": { "cross_ingredient_regressions": 0 }
}
```

---

## Summary

- All targeted unit tests pass
- No regression in alias lookup or override key tests
- Live validation confirms 1 additional Anchoas recovery (`Alconfi sta`) and 16 alias re-keys with zero cross-ingredient regressions
