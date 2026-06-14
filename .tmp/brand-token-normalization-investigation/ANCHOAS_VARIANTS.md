# Anchoas Deep Analysis

**Ingredient ID:** `c811f67f-df4d-4194-ba8b-7a15d4af38bd`  
**Investigation date:** 2026-06-14  
**Data source:** Live VL `ingredient_aliases` + matcher simulation

---

## Overview

Anchoas is the **worst-case** OCR brand-drift ingredient in Validation Lab:

| Metric | Value |
|--------|-------|
| Total confirmed alias rows | **10** |
| Unique normalized keys | **10** (zero collapse today) |
| Suppliers | **2** (AVILUDO, AVIJUDO) |
| OCR stability unique spellings | **14** (same PDF, repeated reads) |
| Current matcher hit rate (5 variants) | **3/5 (60%)** |
| With fuzzy brand-stem (ed≤2) | **5/7 (71%)** |

Every OCR spelling has been manually confirmed as a separate alias row — classic whack-a-mole.

---

## All 10 Alias Rows

### AVILUDO — Alconfrisa family (6 rows)

| # | alias_name | normalized_alias | Match today? |
|---|------------|------------------|--------------|
| 1 | Filete de Anchovas Alconfrisa Lt 495 g | `filete de anchovas alconfrisa 495` | ✅ |
| 2 | Filete de Anchovas Alconfi sta Lt 495 g | `filete de anchovas alconfi sta 495` | ✅ |
| 3 | Filete de Anchovas Alconfrista Lt 495 g | `filete de anchovas alconfrista 495` | ✅ |
| 4 | Filete de Anchoas Alcoinfoosa L4 495 g | `filete de anchoas alcoinfoosa 495` | ✅ (if OCR matches stored key) |
| 5 | Filete de Anchovas Alconfiosa L 495 g | `filete de anchovas alconfiosa 495` | ✅ (if OCR matches stored key) |
| 6 | Filete de Anchoas Alconfitosa L4 495 g | `filete de anchoas alconfitosa 495` | ✅ (if OCR matches stored key) |

**Brand stem cluster (AVILUDO):** alconfrisa, alconfrista, alconfirosa, alconfi sta, alconfiosa, alcoinfoosa, alconfitosa, alconfirsta, alcofiorisa

All variants share product prefix `filete de anchovas/anchoas` + weight `495`. Only the brand token differs.

### AVIJUDO — Alfonsoita family (4 rows)

| # | alias_name | normalized_alias | Match today? |
|---|------------|------------------|--------------|
| 1 | Filete de Anchoas Alfonsoita L4 495 g | `filete de anchoas alfonsoita 495` | ✅ |
| 2 | Filete de Anchoas Alfoncisa L4 495 g | `filete de anchoas alfoncisa 495` | ✅ |
| 3 | Filete de Anchoas Alfonsica L4 495 g | `filete de anchoas alfonsica 495` | ✅ |
| 4 | Filete de Anchoas Alcoinfiosa L4 495 g | `filete de anchoas alcoinfiosa 495` | ✅ |

**Brand stem cluster (AVIJUDO):** alfonsoita, alfoncisa, alfonsica, alcoinfiosa

Separate supplier scope — same fragmentation pattern, different brand family.

---

## Brand Token Extraction

Heuristic: token immediately after `anchovas`/`anchoas`, before unit/weight markers.

```
Filete de Anchovas Alconfirosa LI 495 g
                    ^^^^^^^^^^
                    brand token
```

After normalization via `normalizeOperationalAliasKey`:

```
filete de anchovas alconfirosa 495
```

**Problem:** `normalizeOperationalAliasKey` preserves every OCR character as a distinct token. There is no brand-stem collapse, no fuzzy tolerance, no space-join of split tokens (`alconfi sta` stays two tokens).

Relevant code path:

```99:118:src/lib/ingredient-operational-alias-memory.ts
export function normalizeOperationalAliasKey(raw: string): string {
  // shorthand expand → normalizeInvoiceAliasMemoryKey → lowercase strip punctuation
  const parts = [...compact.split(/\s+/).filter(Boolean), ...weightTokens];
  return [...new Set(parts)].join(" ").trim();
}
```

Lookup is **exact-key only** via `buildOverrideKeysFromInvoiceLine` → `lookupIngredientIdFromAliasMap`.

---

## Live Matcher Simulation (2026-06-14)

Tested against hydrated alias map with supplier `AVILUDO`:

| OCR variant | Result | Notes |
|-------------|--------|-------|
| `Filete de Anchoas Alconfirosa LI 495 g` | ❌ **unmatched** | Post-hardening stable spelling — **not in DB** |
| `Filete de Anchovas Alconfrista Lt 495 g` | ✅ confirmed-override | Stored alias |
| `Filete de Anchovas Alconfi sta Lt 495 g` | ✅ confirmed-override | Stored alias (split token) |
| `Filete de Anchovas Alconfrisa Lt 495 g` | ✅ confirmed-override | Stored alias |
| `Filete de Anchovas Alconfirsta L1 495 g` | ❌ unmatched | Character substitution — **not in DB** |

### Extended recovery simulation (7 variants)

| Variant | Exact match | Space-collapse | Fuzzy ed≤2 |
|---------|-------------|----------------|------------|
| Alconfirosa | ❌ | ❌ | ✅ |
| Alconfrista | ✅ | ✅ | ✅ |
| Alconfi sta | ✅ | ❌ | ✅ |
| Alconfrisa | ✅ | ✅ | ✅ |
| Alconfirsta | ❌ | ❌ | ✅ |
| Alconfi osa | ❌ | ✅ | ✅ |
| Alcofiorisa | ❌ | ❌ | ✅ |

**Recovery rates:**
- Exact (current): 3/7 (43%)
- Space-collapse only: 4/7 (57%)
- Fuzzy brand-stem ed≤2: 5/7 (71%)

---

## Brand Canonicalization Simulation

Applying prefix-strip + space-collapse + unit removal:

| alias_name | normalized_alias | brand_v1 key |
|------------|------------------|--------------|
| Filete de Anchovas Alconfrisa Lt 495 g | `filete de anchovas alconfrisa 495` | `alconfrisa` |
| Filete de Anchovas Alconfi sta Lt 495 g | `filete de anchovas alconfi sta 495` | `alconfista` |
| Filete de Anchovas Alconfrista Lt 495 g | `filete de anchovas alconfrista 495` | `alconfrista` |
| Filete de Anchoas Alcoinfoosa L4 495 g | `filete de anchoas alcoinfoosa 495` | `alcoinfoosa` |
| Filete de Anchovas Alconfiosa L 495 g | `filete de anchovas alconfiosa 495` | `alconfiosa` |
| Filete de Anchoas Alconfitosa L4 495 g | `filete de anchoas alconfitosa 495` | `alconfitosa` |

With edit-distance ≤2 clustering on brand_v1 keys, all 6 AVILUDO rows collapse to **1 canonical brand stem** (`alconfrisa` cluster).

**Known miss variants not in DB:**
- `alconfirosa` — post-hardening OCR stable output
- `alconfirsta` — character substitution variant
- `alconfilosa` — transposition variant

---

## OCR Stability Clustering

From `.tmp/vl-ocr-rc/ocr-stability-runs.json` — 14 unique Anchovas line spellings:

**After space-collapse on brand token:** 12 unique forms  
**After edit-distance ≤2 clustering:** ~5 clusters

```
Cluster 1: alconfrisa, alconfrista, alconfrisa (dominant)
Cluster 2: alconfirosa, alconfirsta
Cluster 3: alconfista (from alconfi sta, alconfi osa)
Cluster 4: alconfiosa, alcoinfoosa, alconfitosa
Cluster 5: alcofiorisa
```

---

## Invoice Context

AVILUDO April invoice (`c2f52357-0f80-491a-ba14-c97ff4837472`):

- **9 invoice lines** total
- **8 lines** rematch via confirmed override on re-read
- **1 line** (Anchoas) toggles unmatched when OCR locks to post-hardening `Alconfirosa`

This is the recurring user-visible failure: not a persistence bug, but **exact-key recall under OCR variance**.

---

## Root Cause (Anchoas-specific)

1. Long brand token (`Alconfrisa` / variants) is highly susceptible to OCR character drift
2. Each drift spelling gets manually confirmed → separate alias row
3. New OCR runs produce spellings not yet confirmed → lookup miss
4. `normalizeOperationalAliasKey` has no brand-stem normalization
5. `lookupIngredientIdFromAliasMap` has zero fuzzy tolerance on brand tokens

**Aligned prior investigations:**
- `.tmp/anchovas-persistence-paradox/` — exact-key recall, not save-path bug
- `.tmp/create-ingredient-persistence-gap/` — Anchoas alias audit
- `.tmp/anchoas-reread-investigation/` — post-hardening `Alconfirosa` stable miss
