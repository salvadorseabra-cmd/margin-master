# Fuzzy Rules — Phase 1B Supplier-Scoped Alias Recovery

**Date:** 2026-06-14

## Scope

- **Alias records only** — iterates `SUPPLIER::normalized_alias` entries in `IngredientAliasMap`
- **Same supplier only** — supplier name must match invoice line supplier (case-insensitive)
- **Same ingredient family** — product prefix must match (with anchovas/anchoas normalization)
- **No catalog search** — never scans ingredients table or semantic index

## Brand Fingerprint Extraction

```typescript
extractBrandFingerprint(normalizedKey):
  1. Strip longest matching product prefix (filete de anchovas, pepinos extra, atum oleo, etc.)
  2. Remove unit/weight tokens (495, li, lt, l1, kg, g, ml, cl, 6x1)
  3. Collapse remaining spaces → single string (e.g. "alconfrisa")
```

Minimum fingerprint length: **4 characters** (prevents short-token false positives).

## Matching Rules

| Rule | Value |
|------|-------|
| Edit distance | ≤ 2 (insertion, deletion, substitution) |
| Supplier scope | Mandatory — only `SUPPLIER::` prefixed map keys |
| Product prefix | Must be identical or anchovas↔anchoas equivalent |
| Ambiguity | If ≥2 different `ingredient_id` values tie at best distance → **no match** |

## Tie-Breaking

1. Prefer lowest edit distance
2. If multiple `ingredient_id` clusters share the best distance → reject (conservative)
3. Within same `ingredient_id`, any matching alias in cluster is sufficient

## Must Recover (AVILUDO Anchoas cluster)

| Query variant | Stored alias matched | Distance |
|---------------|---------------------|----------|
| Alconfirosa | alconfiosa / alconfrisa | 1–2 |
| Alconfirsta | alconfista | 1 |
| Alconfi osa | alconfiosa | 0 (post Phase 1 collapse) |

## Must NOT Recover

| Query | Stored | Reason |
|-------|--------|--------|
| pepino | pepinos extra vii | Different product prefix; fingerprint too short |
| atum | atum oleo belo | Different product prefix; ed > 2 |
| arroz | arroz agulha metrochef | Different product prefix; ed >> 2 |

## Diagnostics

Dev-only log prefix: `[fuzzy-alias-recovery]`

Fields: `supplier`, `candidateKey`, `matchedKey`, `distance`, `ingredientId`
