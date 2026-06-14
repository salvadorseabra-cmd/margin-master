# Recommended Design — Hybrid D (Brand-Token Canonicalization + Fuzzy Lookup)

**Investigation date:** 2026-06-14  
**Recommendation:** Option D — Hybrid  
**Rationale:** Highest recall with lowest user friction; incremental rollout; no regression on stable lines.

---

## Design Overview

```
Invoice OCR line
  → normalizeOperationalAliasKey
      ├── [existing] tokenize, lowercase, strip punctuation
      └── [NEW Phase 1] brand-stem pass: collapse spaces in long tokens
  → buildOverrideKeysFromInvoiceLine (unchanged)
  → lookupIngredientIdFromAliasMap
      ├── [existing] exact-key match (first pass)
      └── [NEW Phase 1] supplier-scoped brand fingerprint fuzzy match (ed≤2)
```

**Principle:** Exact-key first, fuzzy fallback second. No changes to alias confirmation UX or DB schema.

---

## Phase 1 — Smallest Fix, Biggest Impact

### 1a. Space-collapse in `normalizeOperationalAliasKey`

After standard tokenization, collapse internal spaces within tokens ≥5 characters:

```
"alconfi sta"  →  "alconfista"   (split-token OCR fix)
"alconfi osa"  →  "alconfiosa"   (split-token OCR fix)
"metro chef"   →  "metrochef"    (format spacing)
"12x1 kg"      →  "12x1kg"       (weight format)
```

**Rule:**
```typescript
// For each token in normalized key:
// if token.length >= 5 and contains no digits:
//   collapse any internal spaces (token is already space-delimited, so this
//   handles the case where OCR splits a brand name across tokens)
// Additionally: join adjacent short tokens that form a brand stem
//   e.g. ["alconfi", "sta"] → "alconfista"
```

**Scope:** Only affects tokens after product prefix stripping. Product prefixes (`filete de anchovas`, `atum oleo`, etc.) are preserved as-is.

### 1b. Supplier-scoped fuzzy lookup in `lookupIngredientIdFromAliasMap`

On exact-key miss:

1. Extract brand fingerprint from query key:
   - Strip known product prefix
   - Remove unit/weight tokens (`495`, `li`, `lt`, `l1`, `l4`, `kg`, etc.)
   - Collapse remaining tokens to single string
2. For each stored alias with matching supplier:
   - Compute brand fingerprint of stored alias
   - If Levenshtein distance ≤2 → candidate match
3. Return ingredient ID of best candidate (lowest edit distance)

**Supplier scope guard:** Fuzzy match only considers aliases where `supplier_name` matches the invoice line's supplier. This prevents cross-supplier false positives (e.g., AVILUDO Alconfrisa ≠ AVIJUDO Alfonsoita).

### Expected impact (Phase 1 alone)

| Metric | Before | After Phase 1 |
|--------|--------|---------------|
| Anchoas matcher hit rate (5 variants) | 60% (3/5) | ~80% (4/5) |
| Anchoas matcher hit rate (7 variants) | 43% (3/7) | ~71% (5/7) |
| AVILUDO April invoice failures | 1/9 lines | 0 (typical drift) |
| DB changes required | — | None |
| New alias confirms required | — | None |

---

## Phase 2 — DB Hygiene (Optional)

### 2a. Canonical brand key migration

Migrate existing alias rows to canonical brand fingerprints:

| Ingredient | Current rows | Target rows | Action |
|------------|-------------|-------------|--------|
| Anchoas (AVILUDO) | 6 | 1 | Merge to `alconfrisa` canonical |
| Anchoas (AVIJUDO) | 4 | 1 | Merge to `alfonsoita` canonical |
| Pepino conserva | 6 | 1–2 | Merge Extra variants |
| Atum em óleo | 6 | 2 | Keep Belo/Bolsa paths |
| Others | 14 | 9–11 | Per-family collapse |

**Estimated savings:** ~20 redundant alias rows (56% of DB).

### 2b. Extend `RELATED_ALIAS_TOKEN_SWAPS`

Add deterministic brand OCR clusters alongside existing bacon/streaky swaps:

```typescript
// Brand OCR clusters (deterministic, no fuzzy needed for these)
{ from: "flor", to: "fior" },      // Mozzarella
{ from: "gemo", to: "gema" },      // Gema líquida
{ from: "remy", to: "reny" },      // Nata Pantagruel
{ from: "boisa", to: "bolsa" },    // Atum Nau
{ from: "pepinoso", to: "pepinos" }, // Pepino
```

These are safe because they are known OCR substitutions with no ambiguity.

---

## Phase 3 — OCR Stability (Optional, Complementary)

- OCR `temperature=0` to reduce drift at source
- Does **not** replace Phase 1 — even with temperature=0, existing 36 fragmented keys remain
- Reduces future alias growth rate

---

## Brand Fingerprint Extraction Spec

```typescript
function extractBrandFingerprint(normalizedKey: string): string {
  // 1. Strip product prefix
  const prefixes = [
    "filete de anchovas", "filete de anchoas",
    "atum oleo", "pepinos extra", "pepino",
    "arroz agulha", "chocolate culinaria", "chocolate",
    "acucar branco", "nata culinaria", "nata",
    "ovo liquido past", "mozzarella",
  ];
  let core = normalizedKey;
  for (const prefix of prefixes) {
    if (core.startsWith(prefix)) {
      core = core.slice(prefix.length).trim();
      break;
    }
  }

  // 2. Remove unit/weight tokens
  core = core
    .replace(/\b\d+\b/g, "")
    .replace(/\b(li|lt|l1|l4|l|kg|g|ml|cl)\b/g, "")
    .trim();

  // 3. Collapse spaces
  return core.replace(/\s+/g, "");
}
```

**Examples:**

| normalized_alias | brand fingerprint |
|------------------|-------------------|
| `filete de anchovas alconfrisa 495` | `alconfrisa` |
| `filete de anchovas alconfi sta 495` | `alconfista` |
| `filete de anchovas alconfirosa 495` | `alconfirosa` |
| `mozzarella fior di latte` | `fiordilatte` |
| `mozzarella flor di latte` | `flordilatte` |
| `acucar branco metro chef` | `metrochef` |

---

## Fuzzy Match Algorithm

```typescript
function fuzzyBrandLookup(
  queryKey: string,
  supplier: string,
  aliasMap: Map<string, AliasEntry>,
  maxEditDistance: number = 2,
): string | null {
  const queryFp = extractBrandFingerprint(queryKey);
  if (queryFp.length < 4) return null; // guard short tokens

  let bestMatch: { ingredientId: string; distance: number } | null = null;

  for (const [storedKey, entry] of aliasMap) {
    if (entry.supplier.toUpperCase() !== supplier.toUpperCase()) continue;

    const storedFp = extractBrandFingerprint(storedKey);
    const distance = levenshtein(queryFp, storedFp);

    if (distance <= maxEditDistance) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { ingredientId: entry.ingredientId, distance };
      }
    }
  }

  return bestMatch?.ingredientId ?? null;
}
```

**Guard rails:**
- Minimum fingerprint length: 4 chars (prevents false positives on short tokens)
- Supplier scope: mandatory
- Max edit distance: 2 (tunable; 3 would catch more but increase false-positive risk)
- Exact-key pass always runs first

---

## False-Positive Risk Assessment

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Short brand token (<4 chars) | High | Minimum fingerprint length guard |
| Cross-supplier match | High | Supplier scope mandatory |
| Different products, same supplier | Low | Product prefix stripping isolates brand |
| ed=2 between unrelated brands | Low | VL has few suppliers per ingredient |
| `flor` matching `flor` (non-cheese) | Very low | Supplier scope + product prefix |

At VL scale (36 aliases, 10 ingredients, ~5 suppliers), false-positive risk is **low** with supplier scoping.

---

## Rollout Plan

| Phase | Scope | Effort | Impact | Risk |
|-------|-------|--------|--------|------|
| **1a** Space-collapse in normalize | 1 function | Small | ~40% miss fix | Very low |
| **1b** Fuzzy lookup fallback | 1 function + helper | Small | ~71% miss fix | Low (scoped) |
| **2a** DB alias dedup | Migration script | Medium | ~20 row reduction | Low (read-only first) |
| **2b** Token swap extension | 1 constant | Trivial | Deterministic fixes | Very low |
| **3** OCR temperature=0 | OCR config | Small | Reduces future drift | None |

**Recommended minimum:** Phase 1a + 1b. Everything else is optional enhancement.

---

## Testing Strategy

1. **Regression:** All currently-matching Anchoas variants still hit (3/3 stored spellings)
2. **Recovery:** `Alconfirosa` and `Alconfirsta` now match via fuzzy fallback
3. **Cross-ingredient:** Pepino, Atum, Mozzarella, Gema variants recover
4. **False-positive:** No cross-supplier matches; no matches on unrelated products
5. **Validation script:** `scripts/validate-brand-token-variants.mts` (read-only repro)

---

## What This Does NOT Change

- Alias confirmation UX (user flow unchanged)
- DB schema (no migrations required for Phase 1)
- OCR pipeline (Phase 3 is optional and separate)
- Invoice persistence path (lookup-only change)
- `buildOverrideKeysFromInvoiceLine` key format (backward compatible)
