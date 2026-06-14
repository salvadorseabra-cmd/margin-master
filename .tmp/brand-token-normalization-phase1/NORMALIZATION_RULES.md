# Phase 1 Normalization Rules — Whitespace Collapse Only

**Date:** 2026-06-14  
**Scope:** `normalizeBrandToken()` + `normalizeOperationalAliasKey()` in `ingredient-operational-alias-memory.ts`

---

## Pipeline Order

1. **Pre-collapse (alpha OCR splits only)** — before `normalizeSupplierShorthand`, so `chef` is not fuzzy-expanded to `cheddar`
2. **Strip pack-format tokens** — `12x1 kg` extracted and held aside (shorthand breaks `12x1kg`)
3. **Supplier shorthand + alias memory normalization** — unchanged upstream behavior
4. **Post-collapse (alpha + pack format)** — on compact tokens
5. **Re-append** preserved weight tokens and pack-format tokens

Both **write** (`buildOverrideKeysFromInvoiceLine`) and **read** (`lookupIngredientIdFromAliasMap`, `resolveNormalizedAliasFromConfirmedRow`) use `normalizeOperationalAliasKey`, so keys stay consistent.

---

## Rule 1 — OCR Alpha Split

Join adjacent tokens when:

| Condition | Example |
|-----------|---------|
| First token: alpha, length 6–10 | `alconfi` (7) |
| Second token: alpha, length 2–3 | `sta` (3) |
| Second token NOT in stop-words or unit list | — |
| Result | `alconfista` |

**Stop-words (never joined):** `de`, `da`, `do`, `em`, `com`, `top`, `down`, `extra`, …

**Unit/format suffixes (never joined):** `lt`, `li`, `l1`, `l4`, `kg`, `g`, …

---

## Rule 2 — Explicit Brand Pair

| Pair | Result |
|------|--------|
| `metro` + `chef` | `metrochef` |

Required because generic rule needs suffix ≤3 chars; `chef` is 4.

---

## Rule 3 — Pack Format Spacing

| Pair | Result |
|------|--------|
| `12x1` + `kg` | `12x1kg` |

Regex: `\d+x\d+` followed by unit token. Extracted before shorthand to avoid `12 x 1kg` corruption.

---

## Explicit Non-Goals (Phase 1)

- No Levenshtein / edit-distance lookup
- No character substitution (`flor` ↔ `fior`)
- No schema or Match Lifecycle changes
- No fuzzy supplier shorthand changes

---

## Edge Cases Handled

| Input | Output | Notes |
|-------|--------|-------|
| `alconfi sta` | `alconfista` | Core OCR split fix |
| `alconfrista` | `alconfrista` | Single token — unchanged |
| `alconfrista` + `lt` | no join | First token >10 chars blocked; `lt` in unit list |
| `metro chef` | `metrochef` | Pre-collapse before chef→cheddar fuzzy |
| `cheddar top` | `cheddar` | `top` in stop-words — no join |
| `12x1 kg` | `12x1kg` | Pack format preserved |
