# Final Verdict — Brand Token Normalization Phase 1

**Date:** 2026-06-14  
**Verdict:** **PARTIAL**

---

## Rationale

Phase 1 whitespace-collapse normalization is **correct, safe, and shippable** but **insufficient alone** for the systemic OCR brand drift problem.

### Success criteria met

- ✅ `normalizeBrandToken()` helper implemented (whitespace-only, no fuzzy)
- ✅ `normalizeOperationalAliasKey()` updated with pre/post collapse pipeline
- ✅ Write/read paths consistent via `buildOverrideKeysFromInvoiceLine`
- ✅ `alconfi sta` → `alconfista` alignment (recovery 2/7 → 3/7)
- ✅ `metro chef` → `metrochef` alignment
- ✅ `12x1 kg` → `12x1kg` pack format alignment
- ✅ `alconfrista` remains distinct from `alconfista`
- ✅ 16 alias rows re-keyed, 0 cross-ingredient regressions
- ✅ 17/17 unit tests pass
- ✅ No schema, Match Lifecycle, pricing, or fuzzy matching changes

### Success criteria not met

- ❌ Anchoas live matcher still 3/7 (character-level variants remain)
- ❌ Pepino matcher 0/4 (character garbling, not whitespace)
- ❌ 4/7 Anchoas variants still require edit-distance ≤2 (deferred Phase 1b)

---

## Recommendation

**Ship Phase 1** — low risk, immediate value for split-token and format-spacing drift.

**Follow with Phase 1b** (supplier-scoped fuzzy brand fingerprint lookup) to reach ~6/7 Anchoas recovery without manual alias confirms.

**Do not rollback** — zero regressions, strictly additive key alignment.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/ingredient-operational-alias-memory.ts` | `normalizeBrandToken()`, pipeline update |
| `src/lib/ingredient-operational-alias-memory.test.ts` | 5 new test cases |
| `scripts/validate-brand-token-variants.mts` | Phase 1 metrics, collapse/pepino/regression modes |
