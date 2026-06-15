# Post-Create Matching Audit

**Date:** 2026-06-15

---

## After create: direct link, not re-match

1. `saveCanonicalIngredientFromInvoiceRow` returns `ingredientId` + `ingredientName` from insert or guard reuse
2. `persistIngredientCorrectionForItem` writes alias → that `ingredientId` (does not change `ingredients.name`)
3. `dualWriteMatchLifecycleAfterIngredientPersist` calls `confirmMatch` with same `ingredientId` — **no rematch**
4. `load()` reloads catalog + aliases

**No post-create pass re-runs fuzzy matching and overwrites the user's canonical name.**

---

## What "Matched to:" displays

`buildMatchTargetLabel` → `resolveMatchTargetDisplayName` → **`ingredients.name`** from catalog.

Does **not** show `suggestedCanonicalName`.

---

## Guard reuse edge case

If `guardIngredientCreation` returns `action: "reuse"`, `ingredientName` comes from **existing** catalog row.

For `"Stracciatella"` vs existing `"Stracciatella 250gr"`: operational keys differ — **reuse unlikely**. Same for `"Mezzi paccheri"` vs `"Mezzi paccheri mancini"`.

---

## Verdict

**Matching override is unlikely.** Display shows linked ingredient's `name`. If UI shows suggestion names, those are what was persisted — not a matching bug.
