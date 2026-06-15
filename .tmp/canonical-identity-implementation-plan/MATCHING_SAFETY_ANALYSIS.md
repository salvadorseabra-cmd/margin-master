# Matching Safety Analysis

**Planning date:** 2026-06-15  
**Critical:** Determine whether canonical identity improvements affect matching and related subsystems

---

## Critical finding: catalog cleanup is isolated from matcher keys

`canonical-ingredient-display-name.ts` docstrings (219–222, 333–336):

> *"Does not touch invoice aliases, matcher keys, or OCR text."*

---

## Pipeline separation

| Concern | Primary module | Uses `cleanCanonicalIngredientNameForCatalog`? |
|---------|---------------|-----------------------------------------------|
| Review & Create **suggestion** | `canonical-ingredient-create.ts` | Yes (via `formatCanonicalIngredientDisplayName`) |
| Review & Create **persist** | `buildExplicitCanonicalInsertPayload` → `buildCatalogIngredientIdentity` | Yes (on user-confirmed name) |
| Invoice **matching** | `ingredient-canonical.ts` → `canonicalizeIngredientIdentity` | **No** |
| Alias **memory** | `ingredient-match-alias-memory.ts` | **No** — stores raw invoice text vs catalog display name |
| Purchase **format** | `invoice-purchase-format.ts` | **No** |
| Price **history** | `ingredient-auto-persist.ts` / price history backfill | Indirect via ingredient ID only |
| Override logic | `ingredient-match-override.ts` | **No** |
| Purchase unit intelligence | `invoice-purchase-format.ts` | **No** |

---

## Isolated vs dangerous coupling

| Change | Isolated? | Coupling point |
|--------|-----------|----------------|
| Phase 1 guard UX | **Yes** | UI + `suggestedCanonicalName` default only |
| Phase 2 noise tokens in display cleanup | **Mostly** | `buildCatalogIngredientIdentity` on persist/rename affects `ingredients.normalized_name` — not matcher |
| Phase 3 ontology in suggestion path | **Mostly** | Same persist path |
| Syncing ontology into `ingredient-identity.ts` | **Dangerous** | Would change semantic match scores, alias promotion, operational equivalence |

---

## Subsystem impact matrix

| Subsystem | Phase 1 | Phase 2 | Phase 3 |
|-----------|---------|---------|---------|
| Invoice matching (`findCanonicalIngredientMatch`) | None | None | None (if ontology stays in create path) |
| Alias memory (`recordInvoiceLineAliasMemory`) | None | None | None |
| Ingredient memory / operational alias | None | None | None |
| Override logic | None | None | None |
| Historical pricing | None | None | None |
| Current price / purchase fields | None | None | None |
| Purchase unit intelligence | None | None | None |

---

## Recommendation

Keep ontology module consumed only by:

- `buildCanonicalIngredientCreateDefaults`
- `generateCanonicalNamingSuggestion` (quality queue)

Do **not** wire into `canonicalizeIngredientIdentity` in Phases 1–3.

---

## Future danger: matching expansion

Identity expansion simulation (`.tmp/identity-expansion-simulation/REPORT.md`) shows Mozzarella fior di latte / Pepino conserva contamination risk when matching improves **without** pack-variant architecture.

Canonical identity phases 1–3 do **not** unblock matching expansion. Pack variant layer is a separate prerequisite.

---

## Safe change boundary

```
SAFE TO CHANGE (Phases 1–3):
  canonical-ingredient-create.ts
  canonical-ingredient-display-name.ts
  canonical-ingredient-create-dialog.tsx
  bulk-canonical-ingredient-create-sheet.tsx
  new canonical-ingredient-ontology.ts (suggestion path only)

DO NOT CHANGE (without separate safety review):
  ingredient-identity.ts (matcher)
  ingredient-canonical.ts (match pipeline)
  ingredient-match-alias-memory.ts
  invoice-purchase-format.ts
```
