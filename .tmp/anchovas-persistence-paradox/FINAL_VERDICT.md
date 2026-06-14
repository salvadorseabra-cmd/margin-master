# Final Verdict — Anchovas Persistence Paradox

**Generated:** 2026-06-14  
**Queried live VL DB:** 2026-06-14 (post-investigation re-read at 17:15Z)  
**Verdict tag:** `ALIAS_KEY_GAP_AFTER_OCR_STABILIZATION`  
**Classification:** Not a persistence bug — design limitation (exact-key recall)

---

## Direct Answers to All 7 Questions

### 1. Is "Ingredient mapping saved" persisting an alias row?

**Yes.**

The toast fires only from the picker/correction path (`handleSelectCorrectionIngredient` → `onSelectIngredientForItem` → `persistIngredientCorrectionForItem` → `persistManualIngredientCorrection`). On success:

```3290:3292:src/routes/invoices.tsx
    if (result.ok) {
      toast("Ingredient mapping saved");
```

Both picker and confirm-suggestion paths call `upsertConfirmedAlias` → `ingredient_aliases` INSERT/UPDATE. Confirm-suggestion path uses the same persist chain but does **not** show this toast.

---

### 2. Which table receives the write?

**Primary durable table: `ingredient_aliases`**

Additionally (not DB tables):

| Store | Purpose |
|-------|---------|
| In-memory `confirmedAliases` map | Session alias lookup |
| In-memory `ingredientMatchOverrides` | Override map (step 1 matcher) |
| In-memory operational alias memory | Recurring shorthand |
| `localStorage` `marginly:invoice-ingredient-aliases:{userId}` | Browser-persisted alias map |
| `invoice_item_matches` via MLS dual-write | `confirmMatch` / `correctMatch` (fire-and-forget) |

---

### 3. Does Anchovas create alias memory or confirmed override memory?

**Both — always, on manual confirm.**

`applyManualIngredientCorrection` writes all three in one call:

```135:156:src/lib/ingredient-correction-memory.ts
  const nextConfirmedAliases = rememberConfirmedAliasInMap(...);
  rememberOperationalAlias(..., "manual_confirmation", MANUAL_CONFIRMATION_CONFIDENCE);
  rememberIngredientMatchOverride(...);
```

On re-read, alias rows hydrate into override map at page load. At match time, override (step 1) is consulted first → live Anchovas row shows `match_kind: confirmed-override`, not `confirmed-alias`. Functionally equivalent for recall — same keys.

---

### 4. Compare Pepino conserva persistence path vs Anchovas persistence path

| Aspect | Anchovas | Pepino (Bidfood) |
|--------|----------|------------------|
| **Save handler** | Identical (`persistManualIngredientCorrection`) | Identical |
| **OCR text** | Long brand token, variant-sensitive | Stable short `"Pepino"` |
| **Auto-match path** | Alias/override exact-key only | Override or catalog `exact` |
| **Persisted on seed** | `confirmed` if alias/override hit | `suggested` for `exact`; `confirmed` for override |
| **Virtual (READ_CUTOVER=OFF)** | Same as matcher | `exact` shown as `confirmed` |
| **User confirm creates** | Alias for **that OCR spelling only** | Alias for `"Pepino"` |
| **Semantic fallback** | ~0.23, rejected | N/A when exact/override fires |

**Same persistence code; different recall mechanism.**

---

### 5. Trace exact records created after: Anchovas → Match to Anchoas → "Ingredient mapping saved"

Example: picker confirm on `Filete de Anchovas Alconfrista Lt 495 g` → Anchoas

| Layer | Record |
|-------|--------|
| **DB `ingredient_aliases`** | `alias_name` = exact OCR text; `normalized_alias` = `filete de anchovas alconfrista 495`; `supplier_name` = `AVILUDO`; `confirmed_by_user` = true; `confidence` = 10 |
| **DB `invoice_item_matches`** | `status=confirmed`, `ingredient_id=c811f67f…`, `match_kind=manual` (MLS dual-write) |
| **In-memory override** | Key `AVILUDO::filete de anchovas alconfrista 495` → Anchoas |
| **In-memory alias map** | Same key → `c811f67f…` |
| **Operational alias** | Session memory for line text |
| **localStorage** | Updated alias map; cleared reject pair if any |
| **Pricing** | `persistOperationalIngredientCostFromInvoiceLine` may update `ingredients.current_price` |

Live evidence — alias added 2026-06-14:

```
id: d4809e61-16b1-468c-a0d7-fba1479a5a6c
alias_name: Filete de Anchovas Alconfrista Lt 495 g
normalized_alias: filete de anchovas alconfrista 495
created_at: 2026-06-14T15:39:24Z
```

---

### 6. After re-read: which memory source is consulted? (order)

From `findCanonicalIngredientMatch`:

1. **User-confirmed override** (`lookupIngredientMatchOverride`) — hydrated from all `ingredient_aliases` rows at load
2. **Operational alias memory** (recurring shorthand)
3. **Confirmed DB aliases** (`IngredientAliasMap`)
4. **Exact operational memory**
5. **Family-aware deterministic scoring**
6. **Semantic similarity fallback**

Reject pairs (localStorage) can block steps 1–4.

**Anchovas on re-read:** Steps 1 & 3 are exact-key — hit only if OCR normalizes to a stored key.  
**Pepino on re-read:** Step 1 hits on bare `"Pepino"` if previously confirmed; OCR text doesn't drift.

---

### 7. Why does Pepino survive re-read but Anchovas sometimes does not?

**Three independent reasons:**

**1. OCR stability vs alias coverage mismatch (Anchovas)**

- Pre-hardening: brand token flipped → alias hit/miss toggled
- Post-hardening: OCR locks to `Alconfirosa` — **still no alias** → **unmatched** (verified live matcher)
- Live re-read at 17:15Z produced `Alconfrista` — alias exists → **matched**

**2. Per-variant alias keys (Anchovas)**

User confirm saves alias for **OCR text at confirm time only**. Confirming `Alconfrista` does not cover `Alconfirosa` or `Alconfi sta` unless each was separately confirmed. 10 Anchoas aliases accumulated whack-a-mole style.

**3. Pepino layer stability**

OCR always returns `"Pepino"`. After user confirm, override key `Bidfood::pepino` persists across re-reads regardless of invoice item UUID churn. Virtual layer also treats bare `exact` as confirmed when READ_CUTOVER=OFF.

**T8 preserve policy:** Not implemented — re-read CASCADE-deletes items/matches and re-seeds from fresh OCR + current memory. Prior `invoice_item_id` confirmations are not carried forward.

---

## Live DB Snapshot (Post-OCR Hardening)

| Field | Value |
|-------|-------|
| Anchovas item ID | `a1ff870a-a6a0-48b1-be57-af8e02f5c532` (17:15Z re-read) |
| Current OCR | `Filete de Anchovas Alconfrista Lt 495 g` |
| Match status | `confirmed` / `match_kind: confirmed-override` |
| Anchoas alias count | **10** |
| Aviludo invoice | 9/9 confirmed, all via `confirmed-override` |
| Hardening-stable `Alconfirosa` | **No alias** → matcher **unmatched** |
| `Alconfrista` | **Has alias** → matcher **confirmed-override** |

### Matcher simulation (live aliases + override hydration)

| OCR variant | Result |
|-------------|--------|
| `Alconfirosa LI` (hardening output) | **unmatched** |
| `Alconfrista Lt` (current live) | **confirmed-override** → Anchoas |
| `Alconfi sta Lt` | **confirmed** → Anchoas |
| `Alconfrisa Lt` | **confirmed** → Anchoas |
| `Alconfirsta L1` | **unmatched** |

---

## Root Cause Verdict

| Hypothesis | Verdict |
|------------|---------|
| Alias key missing for new OCR variant despite hardening | **YES — PRIMARY** |
| confirmed-override vs confirmed-alias difference | Cosmetic only |
| Pepino exact match vs Anchovas alias-only | **YES — contributing** |
| User creates alias for one variant, re-read produces different variant | **YES — PRIMARY (pre-hardening)** |
| T8 no preserve policy | **YES — contributing** |
| Persistence/MLS bug | **NO** |
| Matcher bug | **NO** |

---

## Final Statement

The paradox is **real but expected**: persistence works correctly; **recall on re-read is exact-key gated**.

- **Pre-hardening:** OCR non-determinism toggled which alias key was produced.
- **Post-hardening:** OCR is stable but at spelling `Alconfirosa` that was **never manually confirmed**, so auto-match still fails for that spelling.
- **Pepino** appears stable because OCR text doesn't change and a single short-text override covers all re-reads.

**Not a bug** in save path, MLS, or matcher. **Design limitation:** exact-key alias/override memory without fuzzy brand-token canonicalization or T8 preserve policy.

---

## Deliverables Index

| File | Contents |
|------|----------|
| `SAVE_PATH_AUDIT.md` | UI → DB write chain for "Ingredient mapping saved" |
| `MEMORY_SOURCE_AUDIT.md` | Matcher lookup order; Anchovas vs Pepino hits |
| `ALIAS_RECORDS.md` | 10 live Anchoas alias rows; OCR variant mapping |
| `ANCHOVAS_TRACE.md` | invoice_item_id history; re-read outcomes |
| `PEPINO_COMPARISON.md` | Side-by-side stability analysis |
| `ROOT_CAUSE.md` | Hypothesis classification; era tags |
| `FINAL_VERDICT.md` | This document |

**Optional validation:** `scripts/validate-anchovas-persistence.mts`
