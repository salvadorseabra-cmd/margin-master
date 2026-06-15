# Phase 1 — Empty Fix Analysis

**Planning date:** 2026-06-15  
**Scope:** EMPTY canonical cases only

---

## Target rows (six Bidfood produce/herb lines)

| Invoice | Class | Suggested | Ideal |
|---------|-------|-----------|-------|
| Tomilho | EMPTY | null | Tomilho |
| Manjericão | EMPTY | null | Manjericão |
| Hortelã | EMPTY | null | Hortelã |
| Alho Francês | EMPTY | null | Alho francês |
| Courgettes | EMPTY | null | Courgette |
| Abóbora Butternut | EMPTY | null | Abóbora butternut |

---

## Root cause (exact)

**Not parser/OCR/LLM failure.** Single deterministic path:

1. `looksLikeInvoiceShorthandName` → false
2. `looksLikeSupplierAbbreviatedCatalogName` → false
3. `formatCanonicalIngredientDisplayName(invoiceAlias)` → title-case only
4. `confirmedNameMatchesInvoiceAlias(suggested, invoiceAlias)` → **true** → `suggestedCanonicalName = null`

---

## Files and functions involved

| File | Function | Role |
|------|----------|------|
| `src/lib/canonical-ingredient-create.ts` | `buildCanonicalIngredientCreateDefaults` (146–179) | Suggestion entry |
| `src/lib/canonical-ingredient-create.ts` | `confirmedNameMatchesInvoiceAlias` (73–81) | Nulls suggestion |
| `src/lib/canonical-ingredient-create.ts` | `validateCanonicalIngredientName` (83–130) | Blocks submit when ≡ alias |
| `src/lib/canonical-ingredient-display-name.ts` | `formatCanonicalIngredientDisplayName` (338–348) | Title-case only for these rows |
| `src/lib/canonical-ingredient-display-name.ts` | `cleanCanonicalIngredientNameForCatalog` (224–245) | No tokens to strip |
| `src/lib/normalizeIngredient.ts` | `normalizeIngredientName` | Fold comparison |
| `src/components/canonical-ingredient-create-dialog.tsx` | Dialog UI | Shows empty confirmed field |
| `src/components/bulk-canonical-ingredient-create-sheet.tsx` | Bulk sheet | Inconsistent pre-fill vs dialog |

---

## Proposed fix (design only)

- **Keep** submit validation: user cannot submit name ≡ invoice alias without explicit catalog-ready exception.
- **Change** suggestion UX: when cleanup produces catalog-ready name ≡ alias, **pre-fill** confirmed field with badge *"Invoice name is catalog-ready"* instead of nulling preview.
- Optional: add `catalogReadyDefault` separate from `suggestedCanonicalName` in `CanonicalIngredientCreateFormDefaults`.

---

## Expected improvement (Phase 1 only)

| Metric | Before | After (6 rows → EXCELLENT) |
|--------|--------|----------------------------|
| EMPTY | 14 (42.4%) | 8 (24.2%) |
| EX+ACC usable | 9 (27.3%) | **15 (45.5%)** |
| Bidfood usable | 0/10 | **6/10 (60%)** |

**VL all-extracts (51 rows):** +6 usable → ~26/51 ≈ **51%** (Pepino and similar pass-through rows also benefit).

---

## Implementation complexity

| Dimension | Assessment |
|-----------|------------|
| Effort | **LOW** — ~3–5 dev days |
| Files touched | `canonical-ingredient-create.ts`, dialog, bulk sheet, tests |
| Schema changes | **None** |
| Matcher changes | **None** |
| Normalization changes | **None** |

---

## Risk level: **LOW**

- Regression surface: UI + defaults logic only.
- Existing test expects null today (`does not suggest when cleanup preview equals invoice alias`) — update test intent to distinguish preview vs submit.
- Mitigation: `shouldBlockCanonicalNameOnCreate` still blocks true shorthand (e.g. `ANGUS PTY`) from catalog-ready pass-through.

---

## Rows NOT fixed by Phase 1 alone

Remaining EMPTY rows (8 after Phase 1):

- Salada Ibérica FSTK EMB. 250g — needs Phase 2 noise strip
- Pêra Abacate Hasse — needs Phase 2 brand strip
- De Cecco, SanPellegrino, Baladin, ACQUA S.PELLEGRINO, Recargo, Birra Peroni — pack/beverage/non-ingredient cases
