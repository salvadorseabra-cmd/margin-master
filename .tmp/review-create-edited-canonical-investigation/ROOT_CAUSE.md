# Root Cause — Edited Canonical Persistence

**Date:** 2026-06-15

---

## Symptom

| User edited | UI "Matched to" | Default suggestion |
|-------------|-----------------|-------------------|
| Stracciatella | Stracciatella 250gr | Stracciatella 250gr ✓ exact |
| Mezzi paccheri | Mezzi paccheri mancini | Mezzi paccheri mancini ✓ exact |

"Matched to" reflects `ingredients.name` of linked row. Exact equality with **default suggestions** (not edited values) means DB almost certainly received suggestion strings.

---

## Classification

| Option | Verdict | Evidence |
|--------|---------|----------|
| **A) Persistence failure** | **PRIMARY** | Save chain uses `values.canonicalName`; if DB has suggestion names, edits never reached submit. Prime mechanism: bulk sheet `useEffect` reset on `candidates` change. |
| **B) Matching override** | **Unlikely** | No rematch after create; alias + confirmMatch use create `ingredientId`. |
| **C) Stale UI** | **Unlikely** | `load()` + catalog refresh after create; label reads live `name`. |
| **D) Other** | **Possible** | User submitted without edits; or prior session created suggestion-named rows. |

---

## Root cause

**A — Persistence failure.** User edits not propagated to submit/insert. Leading code suspect: `BulkCanonicalIngredientCreateSheet` resets row state whenever `candidates` reference changes while sheet is open.
