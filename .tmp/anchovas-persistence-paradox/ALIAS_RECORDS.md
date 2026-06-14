# Alias Records — Anchoas (Live VL)

**Generated:** 2026-06-14  
**Queried:** Live Supabase (VL project `bjhnlrgodcqoyzddbpbd`)  
**Ingredient:** Anchoas · `c811f67f-df4d-4194-ba8b-7a15d4af38bd`  
**Mode:** READ-ONLY

---

## Summary

| Metric | Value |
|--------|-------|
| **Confirmed alias count** | **10** (was 8 at start of prior investigation) |
| **AVILUDO-specific aliases** | 4 (Alconfrisa, Alconfi sta, Alconfrista + legacy variants) |
| **Avijudo aliases** | 6 |
| **Lookup key format** | `{SUPPLIER}::{normalized_alias}` e.g. `AVILUDO::filete de anchovas alconfrista 495` |

---

## All 10 Confirmed Alias Rows (Live)

| created_at | supplier | alias_name | normalized_alias | lookup key |
|------------|----------|------------|------------------|------------|
| 2026-06-07 | Avijudo | Filete de Anchoas Alfonsoita L4 495 g | `filete de anchoas alfonsoita 495` | `Avijudo::…` |
| 2026-06-08 | Avijudo | Filete de Anchoas Alfoncisa LI 495 g | `filete de anchoas alfoncisa 495` | `Avijudo::…` |
| 2026-06-08 | **AVILUDO** | Filete de Anchovas Alconfrisa Lt 495 g | `filete de anchovas alconfrisa 495` | `AVILUDO::filete de anchovas alconfrisa 495` |
| 2026-06-08 | Avijudo | Filete de Anchoas Alfonsica L4 495 g | `filete de anchoas alfonsica 495` | `Avijudo::…` |
| 2026-06-09 | Avijudo | Filete de Anchoas Alcoinfiosa L4 495 g | `filete de anchoas alcoinfiosa 495` | `Avijudo::…` |
| 2026-06-09 | Aviludo | Filete de Anchoas Alcoinfoosa L4 495 g | `filete de anchoas alcoinfoosa 495` | `Aviludo::…` |
| 2026-06-09 | Aviludo | Filete de Anchovas Alconfiosa L 495 g | `filete de anchovas alconfiosa 495` | `Aviludo::…` |
| 2026-06-10 | Aviludo | Filete de Anchoas Alconfitosa L4 495 g | `filete de anchoas alconfitosa 495` | `Aviludo::…` |
| 2026-06-14 | **AVILUDO** | Filete de Anchovas Alconfi sta Lt 495 g | `filete de anchovas alconfi sta 495` | `AVILUDO::filete de anchovas alconfi sta 495` |
| 2026-06-14 | **AVILUDO** | Filete de Anchovas Alconfrista Lt 495 g | `filete de anchovas alconfrista 495` | `AVILUDO::filete de anchovas alconfrista 495` |

**New rows from investigation day (2026-06-14):**

| id | alias_name | created_at |
|----|------------|------------|
| (Alconfi sta row) | Filete de Anchovas Alconfi sta Lt 495 g | 2026-06-14 ~15:38Z |
| `d4809e61-16b1-468c-a0d7-fba1479a5a6c` | Filete de Anchovas Alconfrista Lt 495 g | 2026-06-14T15:39:24Z |

---

## OCR Variant → Alias Key Mapping

| OCR brand token / variant | Alias exists? | Match on re-read? |
|---------------------------|---------------|-------------------|
| `Alconfrisa` | ✅ (2026-06-08) | ✅ confirmed |
| `Alconfi sta` | ✅ (2026-06-14) | ✅ confirmed |
| `Alconfrista` | ✅ (2026-06-14) | ✅ confirmed |
| `Alconfirosa` (OCR hardening output) | ❌ **NO ROW** | ❌ **unmatched** |
| `Alconfirsta` | ❌ | ❌ unmatched |
| `Alconfilosa` | ❌ | ❌ unmatched |
| `Alcoinfoosa`, `Alconfiosa`, `Alconfitosa` | ✅ (Aviludo variants) | ✅ if OCR produces that spelling |

---

## Normalization Pipeline

`normalizeInvoiceIngredientName` strips packaging tokens but **does not collapse** spaced brand variants:

| Raw OCR | Normalized | Alias key suffix |
|---------|------------|------------------|
| `…Alconfrisa Lt 495 g` | `filete de anchovas alconfrisa` | `…alconfrista 495` vs `…alconfirosa 495` — **distinct keys** |
| `…Alconfirosa LI 495 g` | `filete de anchoas alconfirosa` | No matching row |
| `…Alconfi sta Lt 495 g` | `filete de anchovas alconfi sta` | Has row (2026-06-14) |

Note: `Anchoas` vs `Anchovas` spelling in product name also produces distinct normalized forms — aliases exist for both spellings where manually confirmed.

---

## Whack-a-Mole Pattern

Each manual confirm during investigation added an alias for **that session's OCR spelling only**:

1. Re-read produced `Alconfi sta` → unmatched → user confirmed → alias added
2. Re-read produced `Alconfrista` → would miss `Alconfi sta` key → user confirmed → alias added
3. OCR hardening locks to `Alconfirosa` → **still no alias** → would unmatched until user confirms again

10 aliases accumulate but **coverage ≠ canonical brand identity** — each variant is a separate exact key.

---

## Conclusion

Aliases persist correctly. The gap is **variant coverage**, not missing persistence. Post-hardening stable spelling `Alconfirosa` remains outside the alias set despite 10 accumulated rows for other spellings.
