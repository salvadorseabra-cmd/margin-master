# Phase 1 Impact Report

**Date:** 2026-06-14  
**Validation:** `npx vite-node scripts/validate-brand-token-variants.mts all`

---

## Summary

| Metric | Before (prior DB keys) | After Phase 1 |
|--------|------------------------|---------------|
| Anchoas matcher exact hits | 3/7 | 3/7 |
| Anchoas recovery simulation | 2/7 | **3/7** |
| Unique alias keys (36 rows) | 36 | **34** (−2) |
| Alias rows re-keyed | 0 | **16** |
| Cross-ingredient regressions | — | **0** |
| Pepino matcher exact hits | 0/4 | 0/4 |

---

## Anchoas Recovery Detail

| Variant | Phase 1 exact | Prior DB exact | Notes |
|---------|---------------|----------------|-------|
| Alconfirosa | ❌ | ❌ | Character drift (needs fuzzy) |
| Alconfrista | ✅ | ✅ | Already stored |
| **Alconfi sta** | ✅ | ❌ | **Phase 1 fix** — collapses to `alconfista` |
| Alconfrisa | ✅ | ✅ | Stable |
| Alconfirsta | ❌ | ❌ | Character substitution |
| Alconfi osa | ❌ | ❌ | Collapses to `alconfiosa` but `li` unit token prevents key match |
| Alcofiorisa | ❌ | ❌ | Transposition — needs fuzzy |

**Key win:** `Alconfi sta` now exact-matches stored `alconfi sta` alias after both sides normalize to `alconfista`.

---

## Alias Key Collapse (16 rows changed)

Examples:

| Ingredient | Before | After |
|------------|--------|-------|
| Anchoas | `filete de anchovas alconfi sta 495` | `filete de anchovas alconfista 495` |
| Açúcar branco | `acucar branco metro chef` | `acucar branco metrochef` |
| Arroz agulha | `arroz agulha metro chef 12x1 kg` | `arroz agulha metrochef 12x1kg` |
| Pepino conserva | `pepinos extra vii frasco 6x720` | `pepinos extra vii frasco 6x720g` |
| Nata culinária | `nata culinaria remy picot 6x1 22` | `nata culinaria remy picot 22 6x1l` |

Unique keys: 36 → 34 (2 pairs collapsed: metro chef/metrochef paths).

---

## Pepino Impact

- 6/7 pepino alias rows re-keyed (pack format `6x720` → `6x720g`)
- Matcher still 0/4 — failures are character-level OCR (`pepinoso`, Extra VII garbling), not whitespace-only
- No new false-positive matches introduced

---

## What Phase 1 Does NOT Fix

- Character-level OCR (`Alconfirosa` ↔ `Alconfrisa`, ed=3)
- Pepino Extra VII/ULI/ULI garbling
- Remaining 4/7 Anchoas variants (need Phase 1b fuzzy or token swaps)
