# Alias Sensitivity Audit

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Canonical alias:** `Filete de Anchovas Alconfrisa Lt 495 g`  
**Lookup key:** `AVILUDO::filete de anchovas alconfrisa 495`  
**Ingredient:** Anchoas · `c811f67f-df4d-4194-ba8b-7a15d4af38bd`

---

## Summary

Alias matching uses **exact operational keys** with zero fuzzy tolerance on brand tokens. A single space, character substitution, or unit-token change creates a new lookup key. Semantic fallback rejects Anchoas variants at ~0.23 score (threshold 0.58).

---

## Lookup Pipeline

```
invoice line name
  → normalizeInvoiceIngredientName()
  → buildOverrideKeysFromInvoiceLine()
  → normalizeOperationalAliasKey() / normalizeInvoiceAliasMemoryKey()
  → lookupIngredientIdFromAliasMap(map, normalized, supplier, rawName)
```

Implementation: `src/lib/ingredient-alias-lookup.ts`, `src/lib/ingredient-match-override.ts`, `src/lib/normalize-ingredient-name.ts`.

**No fuzzy matching** on brand tokens — exact string equality on normalized keys.

---

## Variant Evaluation

Alias at investigation start: `Filete de Anchovas Alconfrisa Lt 495 g`  
Alias map grew to 10+ keys by session end (manual confirms).

| OCR variant | Normalized | Lookup key tried | Hit? (initial DB) | Hit? (after manual confirms) |
|-------------|------------|------------------|-------------------|------------------------------|
| `Alconfrisa` | `filete de anchovas alconfrisa` | `AVILUDO::filete de anchovas alconfrisa 495` | ✅ | ✅ |
| `Alconfi sta` | `filete de anchovas alconfi sta` | `AVILUDO::filete de anchovas alconfi sta 495` | ❌ | ✅ (added ~15:38Z) |
| `Alconfirsta` | `filete de anchovas alconfirsta l1` | `…alconfirsta 495`, `…alconfirsta`, `…alconfirsta l1` | ❌ | ❌ |
| `Alconfirosa` | `filete de anchovas alconfirosa` | `AVILUDO::filete de anchovas alconfirosa 495` | ❌ | ❌ (distinct from stored `alconfiosa`) |
| `Alconfrista` | `filete de anchovas alconfrista` | `AVILUDO::filete de anchovas alconfrista 495` | ❌ | ✅ (added ~16:03Z) |
| `Alconfilosa` | `filete de anchoas alconfilosa` | `…alconfilosa 495` | ❌ | ❌ |

---

## Why `Alconfi sta` Misses (Before Manual Confirm)

OCR inserts a space mid-brand-name:

```
Alconfrisa  →  normalize  →  alconfrisa     →  HIT
Alconfi sta →  normalize  →  alconfi sta    →  MISS (two tokens, new key)
```

No normalization rule collapses spaced brand variants back to `alconfrisa`.

From `.tmp/anchoas-reread-investigation/ALIAS_AUDIT.md`:

> An alias exists for the **Alconfrisa** spelling but **NOT** for the **Alconfi sta** spelling produced by the latest re-read OCR.

---

## Semantic Fallback

When alias lookup misses, semantic matcher runs with conservative thresholds:

| Variant | Semantic score | Rejection reason |
|---------|----------------|------------------|
| `Alconfirsta` | ~0.23 | `no_safe_family_convergence` |
| `Alconfilosa` | ~0.31 | `weak_canonical_overlap` |
| Threshold | 0.58 | — |

Semantic path does **not** rescue OCR brand-token noise for Anchoas.

---

## Tolerance Assessment

| Dimension | Tolerance |
|-----------|-----------|
| Brand token spelling | **Zero** — exact key required |
| Spaced vs joined tokens | **Zero** — `alconfi sta` ≠ `alconfrisa` |
| Unit token variants (`Lt` vs `L1` vs `L4`) | **Partial** — multiple keys generated per line, but each must hit exactly |
| Supplier prefix | **Exact** — `AVILUDO::` required |
| Fuzzy / edit-distance | **None** in alias lookup |

---

## Existing Alias Inventory (Anchoas)

From `.tmp/anchoas-reread-investigation/ALIAS_AUDIT.md` — 8 confirmed aliases at investigation start:

| alias_name (truncated) | normalized_alias |
|------------------------|------------------|
| `…Alconfrisa Lt 495 g` | `filete de anchovas alconfrisa 495` |
| `…Alcoinfoosa L4 495 g` | `filete de anchoas alcoinfoosa 495` |
| `…Alconfiosa L 495 g` | `filete de anchovas alconfiosa 495` |
| `…Alconfitosa L4 495 g` | `filete de anchoas alconfitosa 495` |

Plus Avijudo (May) variants. Each alias covers **one exact OCR spelling** — not a family of variants.

---

## Recommended Resilience (Not Implemented)

Before alias lookup, canonicalize spaced/split brand tokens:

```
alconfi sta  →  alconfrisa   (collapse internal spaces on known brand stems)
alconfirosa  →  alconfrisa   (edit-distance ≤ 2 on supplier-specific dictionary)
```

Or: fuzzy alias lookup with Levenshtein threshold on brand token only, preserving exact match for non-brand fields.

---

## Conclusion

Alias sensitivity **amplifies** OCR non-determinism. The alias system behaves as designed (exact-key confirmed aliases). Instability comes from OCR producing keys that miss the map, not from alias logic bugs.
