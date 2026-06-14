# Memory Source Audit — Matcher Lookup Order on Re-Read

**Generated:** 2026-06-14  
**Investigation:** Anchovas persistence paradox  
**Mode:** READ-ONLY code trace + live matcher simulation  
**Code reference:** `findCanonicalIngredientMatch` in `src/lib/ingredient-canonical.ts`

---

## Matcher Pipeline Order

Documented in code comments and verified by trace:

```993:1000:src/lib/ingredient-canonical.ts
 * 1. User-confirmed override — lookupIngredientMatchOverride
 * 2. Operational alias memory — recurring Horeca shorthand
 * 3. Confirmed DB aliases — IngredientAliasMap
 * 4. Exact operational memory — catalog raw/normalized wording
 * 5. Family-aware deterministic scoring
 * 6. Semantic similarity fallback
```

Supplier shorthand resolution runs in `findInvoiceItemIngredientMatch` **before** this function.

**Reject pairs** (`isRejectedIngredientCandidate` / localStorage) can block steps 1–4 for specific line → ingredient pairs.

---

## Step-by-Step: What Hits for Anchovas vs Pepino

### Anchovas (Aviludo April)

| Step | Source | Anchovas behavior |
|------|--------|-------------------|
| **1. Override** | Hydrated from all `ingredient_aliases` rows at page load | Exact-key hit **only** if OCR normalizes to a key with stored alias |
| **2. Operational alias** | Session recurring shorthand | Rarely hits long brand-token lines |
| **3. DB alias** | `IngredientAliasMap` from confirmed rows | Same keys as override; returns `confirmed-alias` if step 1 missed |
| **4. Operational memory** | Prior exact catalog wording | No hit for invoice OCR text |
| **5. Family scoring** | Deterministic token families | No safe convergence for brand variants |
| **6. Semantic** | Embedding similarity | Rejects Anchoas (~0.23 score, below threshold) |

**Result:** Anchovas auto-match is **alias/override exact-key only**. No fuzzy brand-token collapse.

### Pepino (Bidfood)

| Step | Source | Pepino behavior |
|------|--------|-----------------|
| **1. Override** | `Bidfood::pepino` after user confirm | Hits on bare `"Pepino"` — stable across re-reads |
| **2–3. Alias** | No Bidfood alias for bare `"Pepino"` | N/A unless user confirmed |
| **4. Operational memory** | — | — |
| **5. Catalog exact** | `"Pepino"` → Pepino conserva | Fires when no override; kind = `exact` |
| **6. Semantic** | — | N/A when exact/override fires |

**Result:** Pepino survives via **stable short OCR text** + override hydration, or catalog `exact` match.

---

## Override vs Alias Kind (Cosmetic Difference)

Both use the same lookup keys (`SUPPLIER::normalized_alias`). Override is checked first:

| Step that hits | `match.kind` | Persisted `match_kind` (shadow seed) |
|----------------|--------------|--------------------------------------|
| Step 1 (override) | `confirmed-override` | `confirmed-override` |
| Step 3 (alias only) | `confirmed-alias` | `confirmed-alias` |

Live Aviludo invoice (post re-read): all 9 confirmed lines use `confirmed-override` — consistent with override hydration from alias rows.

**This is not a functional difference for recall.** Both require exact key match.

---

## Post-OCR-Hardening Matcher Simulation (Live VL, 2026-06-14)

With override hydration from 10 Anchoas aliases:

| OCR variant | Step hit | Result |
|-------------|----------|--------|
| `Filete de Anchoas Alconfirosa LI 495 g` (hardening-stable) | None | **unmatched** — no alias key |
| `Filete de Anchovas Alconfrista Lt 495 g` (current live) | Step 1 override | **confirmed-override** → Anchoas |
| `Filete de Anchovas Alconfi sta Lt 495 g` | Step 3 alias (or 1 override) | **confirmed-alias** / **confirmed-override** → Anchoas |
| `Filete de Anchovas Alconfrisa Lt 495 g` | Step 1/3 | **confirmed** → Anchoas |
| `Filete de Anchovas Alconfirsta L1 495 g` | None | **unmatched** |

---

## Re-Read Memory Consultation Flow

```
Re-read triggered
  → DELETE invoice_items + invoice_item_matches (CASCADE)
  → Fresh OCR extraction
  → loadConfirmedIngredientAliasMap (DB)
  → hydrateIngredientMatchOverridesFromAliasRows
  → shadowSeedInvoiceItemMatches (findInvoiceItemIngredientMatch per line)
  → Persist match status from virtual matcher output
```

Memory consulted at seed time = **current DB alias snapshot + hydrated overrides**. No prior `invoice_item_id` linkage.

---

## Virtual vs Persisted Layer (Pepino-Specific)

With `READ_CUTOVER=false`:

| Match kind | Virtual `displayState` | Persisted `status` |
|------------|------------------------|-------------------|
| `exact` | **confirmed** | **suggested** |
| `confirmed-override` | **confirmed** | **confirmed** |
| `confirmed-alias` | **confirmed** | **confirmed** |

Pepino can appear **matched in UI** via virtual `exact` even when persisted is `suggested`. Anchovas has no `exact` path — only alias/override.

---

## Conclusion

Re-read auto-match consults memory in strict priority order. Anchovas depends entirely on steps 1 & 3 (exact-key). Pepino additionally benefits from step 5 (`exact`) and stable OCR. The paradox is explained by **which step fires for which OCR spelling**, not by memory source ordering bugs.
