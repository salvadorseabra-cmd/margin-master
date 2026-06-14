# Root Cause — Create Ingredient Persistence Gap (Anchoas)

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Classification:** `NORMALIZATION_MISMATCH` (primary) — **NOT** `CREATE_FLOW_GAP`

---

## The Paradox (Restated)

**Observation:** The invoice line that originally created canonical ingredient "Anchoas" does not auto-match back to Anchoas after re-read, while a manually matched `Filete de Anchovas …` line **does** persist and auto-match (when OCR matches that spelling).

**Misleading framing:** It appears Create Ingredient fails to persist while Match Existing succeeds.

**Actual finding:** Both flows persist identically. The difference is **recall**, not **write**.

---

## Why It Looks Like Create Doesn't Persist

```
Create Ingredient (May Avijudo, Alfonsoita)
  → alias key: Avijudo::filete de anchoas alfonsoita 495  ✅ stored (+160ms)

Re-read April AVILUDO
  → fresh OCR: Alconfi sta / Alconfrista / Alconfirosa / …
  → lookup key: AVILUDO::filete de anchovas alconfi sta 495  (example)
  → NO HIT unless that exact spelling was separately confirmed

Manual match (Alconfrista)
  → alias key: AVILUDO::filete de anchovas alconfrista 495  ✅ stored

Next re-read IF OCR = Alconfrista
  → HIT → auto-match ✅
```

Create **did** persist — but for a **different invoice line** with a **different OCR key**. April re-read never consults the Alfonsoita key (different supplier scope + different normalized text).

---

## Three Independent Contributing Factors

### 1. Exact-Key Alias Model (Primary)

Alias lookup is keyed to normalized OCR at confirm/create time only. No fuzzy brand-token collapse:

| Distinction | Treated as |
|-------------|------------|
| `Anchoas` vs `Anchovas` | Different keys |
| `Alconfrisa` vs `Alconfi sta` vs `Alconfrista` | Different keys |
| `L4` vs `Lt` vs `LI` vs `L1` | Different keys |

Each re-read OCR variant needs its own confirmed alias row. Manual match fixes **that spelling only** — hence 10 accumulated aliases for one product.

### 2. Wrong "Original Line" Assumption

| Assumption | Reality |
|------------|---------|
| April AVILUDO Anchovas line created Anchoas | **False** |
| Actual create line | Avijudo May: `Filete de Anchoas Alfonsoita L4 495 g` |
| Create-time alias | Exists — `Avijudo::filete de anchoas alfonsoita 495` |
| April re-read consults create alias? | **No** — different supplier + different OCR |

### 3. OCR Variant Churn (Contributing, Out of Scope)

Each invoice re-read can emit a new brand-token spelling. Post-hardening stable spelling `Alconfirosa` still has **no alias row** → unmatched. Manual confirms are whack-a-mole until the current OCR spelling happens to match a stored key.

---

## Hypothesis Classification

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| `CREATE_FLOW_GAP` | **NO** | Code: both paths → `persistManualIngredientCorrection`. DB: alias +160ms after ingredient create. |
| `ALIAS_MISSING` | **Partial** | Missing for *current re-read spelling*, not for create-time spelling. Alfonsoita alias exists. |
| `NORMALIZATION_MISMATCH` | **YES — PRIMARY** | Exact-key model; re-read OCR ≠ any stored alias key unless separately confirmed. |
| `OTHER` | Contributing | OCR non-determinism; no T8 preserve policy. Out of scope per investigation brief. |

---

## What Record Is "Missing"?

Not a missing persist call. The missing record is an **`ingredient_aliases` row for the specific normalized key** the current re-read OCR produces — e.g. `AVILUDO::filete de anchovas alconfirosa 495`.

That row is only created when:

1. User manually matches that exact OCR spelling, OR
2. Create Ingredient is run on a line with that exact OCR text

Running Create on Alfonsoita does **not** create aliases for April AVILUDO spellings.

---

## Code Path Confirmation

Both Create and Match call:

```
persistIngredientCorrectionForItem
  → persistManualIngredientCorrection
       → applyManualIngredientCorrection
            → rememberConfirmedAliasInMap
            → rememberOperationalAlias
            → rememberIngredientMatchOverride
       → upsertConfirmedAlias
```

No branch skips alias persist on create. Failure path returns explicit error if alias upsert fails.

---

## Related Investigations

| Prior audit | Relevant finding |
|-------------|------------------|
| `.tmp/anchovas-persistence-paradox/` | Same exact-key recall model; Pepino comparison |
| `.tmp/anchoas-reread-investigation/` | April invoice trace; OCR variants |
| `.tmp/create-ingredient-ux-audit/` | Create vs Match same persist handler |

---

## Recommended Framing (Not Implementation)

This is a **design limitation** (exact-key recall under OCR variance), not a Create Ingredient persistence bug. Fixes would require product/design changes (fuzzy alias keys, brand-token normalization, OCR-stable key preservation) — out of scope for this investigation.
