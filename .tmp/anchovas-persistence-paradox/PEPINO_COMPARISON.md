# Pepino Comparison — Anchovas vs Pepino Conserva

**Generated:** 2026-06-14  
**Investigation:** Anchovas persistence paradox  
**Mode:** READ-ONLY  
**Related:** `.tmp/pepino-live-validation/`, `.tmp/reread-determinism-investigation/ANCHOAS_PEPINO_COMPARISON.md`

---

## Side-by-Side Overview

| Aspect | Anchovas (Aviludo April) | Pepino (Bidfood) |
|--------|--------------------------|------------------|
| **Invoice ID** | `c2f52357-0f80-491a-ba14-c97ff4837472` | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| **Ingredient ID** | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |
| **OCR text stability** | Brand token highly variant (20+ spellings pre-hardening); post-hardening locks to `Alconfirosa` | Stable short `"Pepino"` |
| **Auto-match mechanism** | Alias/override **exact-key only** | Override **or** catalog `exact` name match |
| **Persisted on shadow seed** | `confirmed` if alias/override hit; else `unmatched` | `suggested` for `exact`; `confirmed` for override |
| **Virtual display (READ_CUTOVER=OFF)** | Same as matcher | `exact` shown as **confirmed** (intentional drift) |
| **User confirm saves** | Alias for **that OCR spelling only** | Alias for `"Pepino"` → Pepino fresco (or conserva per pick) |
| **Semantic fallback** | ~0.23 score, rejected | N/A when exact/override fires |
| **Confirmed alias count** | 10 (Anchoas) | 0 Bidfood aliases for bare `"Pepino"` |

---

## Same Save Handler, Different Match Mechanism

Both ingredients use identical persistence when user confirms:

```
persistIngredientCorrectionForItem
  → persistManualIngredientCorrection
  → upsertConfirmedAlias (ingredient_aliases)
  → applyManualIngredientCorrection (override + operational + alias map)
  → dualWriteMatchLifecycleAfterIngredientPersist
```

**The paradox is not a persistence-path difference.** It is how re-read **recall** works:

- **Anchovas:** recall = exact alias/override key for long OCR string
- **Pepino:** recall = short stable text + override **or** catalog exact match

---

## Pepino — Why It Appears Stable Post-Hardening

### 1. OCR Stability

Bidfood line OCR consistently returns `"Pepino"` (or minor packaging variants). Brand token does not drift across re-reads.

### 2. Override Key Survives Re-Read

After user confirms `"Pepino"` → ingredient:

- Override key: `Bidfood::pepino`
- Persists across re-reads regardless of `invoice_item_id` UUID churn
- Step 1 matcher lookup hits on every re-read

### 3. Catalog Exact Match (Fallback)

Even without override, bare `"Pepino"` exact-matches Pepino conserva in catalog:

| Layer | kind | displayState | persisted status |
|-------|------|--------------|------------------|
| Virtual | `exact` | **confirmed** | — |
| Persisted | `exact` | — | **suggested** |

With `READ_CUTOVER=false`, UI shows Pepino as matched via virtual layer even when persisted is only `suggested`.

### 4. User Lifecycle Can Still Flip Pepino

From `.tmp/pepino-live-validation/`:

1. Re-read → virtual `confirmed`, persisted `suggested`
2. User unmatch → persisted `unmatched`, reject pair in localStorage
3. Re-read → reject pair blocks virtual rematch → appears **unmatched**
4. User reassign → different ingredient (Pepino fresco)

Pepino flip is driven by **user actions + display layer**, not OCR.

---

## Anchovas — Why It Appears Unstable

### 1. OCR Variant Sensitivity (Pre-Hardening)

Brand token flipped between re-reads:

| Re-read | OCR | Alias hit? |
|---------|-----|------------|
| A | `Alconfi sta` | ❌ (before alias added) |
| B | `Alconfrisa` | ✅ |
| C | `Alconfrisa` | ✅ (same as B) |

### 2. Post-Hardening: Stable but Uncovered Spelling

OCR hardening (temperature=0, seed=42) locks to:

```
Filete de Anchoas Alconfirosa LI 495 g  (5/5 stability runs)
```

**No alias row for `Alconfirosa`** → re-read with this spelling = **unmatched**, even though OCR is now deterministic.

### 3. Whack-a-Mole Alias Accumulation

User confirms during investigation added aliases for:

- `Alconfi sta` (2026-06-14)
- `Alconfrista` (2026-06-14)

Live re-read at 17:15Z produced `Alconfrista` → matched. If next re-read produces `Alconfirosa` → would unmatched again.

### 4. No Exact Catalog Match

`"Filete de Anchovas Alconfirosa…"` does not exact-match `"Anchoas"` in catalog. Only alias/override path works.

---

## Opposite Flip Pattern (Historical)

Observed pattern where Anchovas unmatched while Pepino matched (and vice versa):

| Re-read | Anchovas | Pepino |
|---------|----------|--------|
| A | unmatched (`Alconfi sta`, no alias) | matched (virtual exact) |
| B | matched (`Alconfrisa`, alias hit) | unmatched (user unmatch + reject pair) |

**Independent mechanisms:**

- Anchovas flip = OCR-gated alias hit/miss
- Pepino flip = layer-gated (virtual vs persisted) + user lifecycle

---

## Matcher Variability

**Classification: NOT a matcher bug.**

Same OCR + same alias map + same catalog → identical output every time. Verified by `scripts/validate-anchoas-reread.mts matcher` and live simulation.

---

## Conclusion

| | Anchovas | Pepino |
|---|----------|--------|
| **Primary stability factor** | Alias key coverage for OCR spelling | Stable short OCR + override/exact |
| **Post-hardening behavior** | Stable OCR at uncovered spelling (`Alconfirosa`) | Still stable `"Pepino"` |
| **Persistence** | Works correctly | Works correctly |
| **Paradox cause** | Exact-key recall gap | N/A — appears stable unless user unmatchs |

Pepino survives re-read because OCR text doesn't change and a single short-text override covers all re-reads. Anchovas fails when OCR text (stable or not) normalizes to a key with no stored alias.
