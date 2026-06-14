# Normalization Options — A/B/C/D Comparison

**Investigation date:** 2026-06-14  
**Context:** OCR brand-token drift causes exact-key alias lookup misses across 8/9 multi-alias VL ingredients.

---

## Current Architecture

```
Invoice OCR line
  → buildOverrideKeysFromInvoiceLine (supplier + normalized key)
    → normalizeOperationalAliasKey (tokenize, lowercase, strip punctuation)
      → lookupIngredientIdFromAliasMap (exact key match only)
```

**Key code touchpoints:**

| Function | File | Role |
|----------|------|------|
| `normalizeOperationalAliasKey` | `src/lib/ingredient-operational-alias-memory.ts` | Produces lookup key from raw line text |
| `buildOverrideKeysFromInvoiceLine` | `src/lib/ingredient-match-override.ts` | Builds supplier-scoped override keys |
| `lookupIngredientIdFromAliasMap` | `src/lib/ingredient-alias-lookup.ts` | Exact-key alias resolution |
| `buildConfirmedAliasMapFromRows` | `src/lib/ingredient-alias-memory.ts` | Hydrates alias map from DB rows |
| `RELATED_ALIAS_TOKEN_SWAPS` | `src/lib/ingredient-operational-alias-memory.ts` | Existing deterministic token swaps (bacon/streaky pattern) |

**Current limitation:** `normalizeOperationalAliasKey` preserves every OCR character as a distinct token. No brand-stem collapse, no fuzzy tolerance. `RELATED_ALIAS_TOKEN_SWAPS` proves the codebase already supports deterministic token substitution — but only for a handful of hardcoded pairs.

---

## Option A — Manual Aliases (Status Quo)

**Description:** Continue confirming each new OCR spelling as a separate `ingredient_aliases` row.

### How it works

1. User sees unmatched line on invoice re-read
2. User manually confirms match → new alias row with that exact normalized key
3. Next re-read with different OCR spelling → repeat

### Pros

- Zero code risk
- No false-positive matches
- Already implemented and understood

### Cons

- Whack-a-mole: 10 Anchoas rows prove the approach fails at scale
- 14 unique OCR spellings for same PDF line — unbounded growth
- User friction on every re-read with drift
- DB bloat: ~20 redundant rows today, growing linearly

### Impact estimate

| Metric | Value |
|--------|-------|
| Anchoas matcher recovery | 60% (only stored spellings hit) |
| Alias rows needed for full coverage | Unbounded (one per OCR output) |
| User confirms required | Every new OCR variant |

### Verdict: ❌ Status quo only — does not solve the problem

---

## Option B — Brand-Token Canonicalization

**Description:** Normalize brand stem inside `normalizeOperationalAliasKey` before keying. Collapse OCR noise at normalize time.

### How it works

1. After standard tokenization, extract brand stem (longest alpha token after product prefix)
2. Collapse internal spaces in tokens ≥5 chars (`alconfi sta` → `alconfista`)
3. Apply deterministic character-normalization rules (known OCR substitutions)
4. Emit canonical brand fingerprint as part of lookup key

### Pros

- Deterministic — same input always produces same key
- Collapses existing DB aliases over time (fewer unique keys)
- Fixes future OCR output without manual confirms
- Builds on existing `RELATED_ALIAS_TOKEN_SWAPS` pattern

### Cons

- Needs careful brand-stem extraction heuristics
- False-positive risk on short brand tokens (<5 chars)
- Does not help when OCR produces a stem >2 edit-distance from any stored alias
- Requires per-product-prefix rules or generic prefix stripping

### Impact estimate

| Metric | Value |
|--------|-------|
| Anchoas matcher recovery | ~57% (space-collapse fixes split tokens) |
| Alias rows collapsible | ~20 |
| New code surface | `normalizeOperationalAliasKey` only |

### Verdict: ✅ Core of the fix — necessary but not sufficient alone

---

## Option C — Fuzzy Alias Matching

**Description:** At lookup time, if exact key misses, try supplier-scoped edit-distance ≤2 match on brand fingerprint against stored aliases.

### How it works

1. Exact-key lookup (current behavior) — first pass, no regression
2. On miss: extract brand fingerprint from query line
3. Compare against brand fingerprints of stored aliases for same supplier
4. If edit-distance ≤2 and supplier matches → return ingredient ID

### Pros

- Fixes misses without re-confirming or DB changes
- Handles novel OCR variants not yet seen
- Supplier scope prevents cross-ingredient false positives
- Incremental — exact pass unchanged

### Cons

- Slightly non-deterministic (which alias wins if multiple within ed≤2)
- Needs supplier scope guard to prevent cross-supplier matches
- Performance: O(n) scan of supplier aliases per miss (acceptable at VL scale)
- Edge cases: very short brand tokens may false-positive

### Impact estimate

| Metric | Value |
|--------|-------|
| Anchoas matcher recovery | ~71% (5/7 variants) |
| Alias rows collapsible | 0 (lookup-only, no DB change) |
| New code surface | `lookupIngredientIdFromAliasMap` + fingerprint helper |

### Verdict: ✅ Essential lookup fallback — fixes the immediate user-visible miss

---

## Option D — Hybrid (B + C) ⭐ RECOMMENDED

**Description:** Canonicalize brand stem on write (normalize time) + fuzzy match on read (lookup time). Optionally complement with OCR `temperature=0` for future stability.

### How it works

**Phase 1 (immediate, highest impact):**
1. In `normalizeOperationalAliasKey`: collapse internal spaces in tokens ≥5 chars
2. In `lookupIngredientIdFromAliasMap`: on exact miss, supplier-scoped brand fingerprint with edit-distance ≤2

**Phase 2 (optional, DB hygiene):**
3. Migrate existing alias rows to canonical brand keys
4. Deduplicate ~20 redundant rows
5. Extend `RELATED_ALIAS_TOKEN_SWAPS` with brand OCR clusters

**Phase 3 (optional, OCR stability):**
6. OCR `temperature=0` to reduce future drift at source

### Pros

- Highest recall: canonical keys + fuzzy fallback
- Smallest user friction: no manual re-confirmation needed
- Exact-key first pass prevents regression on stable lines
- Complements (does not depend on) OCR hardening
- Incremental rollout: Phase 1 alone fixes ~40–71% of misses

### Cons

- Moderate implementation effort (2 functions + fingerprint helper)
- Needs testing against false-positive edge cases
- Phase 2 DB migration is optional and separate

### Impact estimate

| Metric | Phase 1 only | Full Hybrid D |
|--------|-------------|---------------|
| Anchoas matcher recovery | ~40–57% | ~71% |
| Alias rows collapsible | 0 (lookup only) | ~20 |
| AVILUDO invoice failures | 0 (typical drift) | 0 |
| User confirms needed | 0 | 0 |

### Verdict: ✅ **RECOMMENDED** — best recall-to-effort ratio

---

## Comparison Matrix

| Criterion | A Manual | B Canonicalize | C Fuzzy | D Hybrid |
|-----------|----------|----------------|---------|----------|
| Anchoas recovery | 60% | ~57% | ~71% | ~71% |
| Fixes novel OCR variants | ❌ | Partial | ✅ | ✅ |
| DB row reduction | ❌ (grows) | ✅ (~20) | ❌ | ✅ (~20) |
| Code risk | None | Low | Medium | Medium |
| User friction | High | Low | None | None |
| Regression risk | None | Low | Low (scoped) | Low (exact first) |
| Implementation effort | 0 | Small | Small | Moderate |
| Scales with OCR runs | ❌ | ✅ | ✅ | ✅ |

---

## Code Touchpoints for Implementation

### Phase 1 — `normalizeOperationalAliasKey` (Option B core)

```
src/lib/ingredient-operational-alias-memory.ts
  normalizeOperationalAliasKey()
    → after tokenization, add brand-stem pass:
      1. collapse internal spaces in tokens ≥5 chars
      2. (optional) apply RELATED_ALIAS_TOKEN_SWAPS for brand clusters
```

### Phase 1 — `lookupIngredientIdFromAliasMap` (Option C core)

```
src/lib/ingredient-alias-lookup.ts
  lookupIngredientIdFromAliasMap()
    → after exact miss:
      1. extract brand fingerprint from query key
      2. scan supplier-scoped aliases for ed≤2 match
      3. return best match (lowest edit distance)
```

### Supporting helpers (new)

```
extractBrandFingerprint(normalizedKey: string): string
  → strip product prefix, collapse spaces, remove unit tokens

brandFingerprintEditDistance(a: string, b: string): number
  → Levenshtein on collapsed brand stems
```

### Existing pattern to extend

```129:134:src/lib/ingredient-operational-alias-memory.ts
/** Deterministic reorder/substitution keys for partial lookup boost (no fuzzy). */
// RELATED_ALIAS_TOKEN_SWAPS — bacon/streaky pattern
// Extend with brand OCR clusters: fior↔flor, gema↔gemo, reny↔remy
```

---

## What NOT to do

| Anti-pattern | Why |
|--------------|-----|
| Global fuzzy match without supplier scope | Cross-supplier false positives |
| Lower edit-distance threshold below 2 | Won't catch `Alconfirosa` ↔ `Alconfrisa` (ed=3) — but ed≤2 catches most |
| Replace exact-key with fuzzy-only | Regression on stable lines |
| Manual alias for every OCR variant | Proven failure at 10 Anchoas rows |
| OCR-only fix (temperature=0) | Helps future reads but not 36 existing fragmented keys |
