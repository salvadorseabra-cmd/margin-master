# Implementation Notes — Phase 1

**Date:** 2026-06-15  
**Scope:** EMPTY fix only — no Phase 2/3

---

## Approach

Smallest safe change: separate **preview/prefill behavior** from **submit validation**.

1. Added `isCatalogReadyInvoiceName()` — detects simple produce/herb lines (≤2 tokens, display-only cleanup)
2. Added `catalogReady: boolean` to `CanonicalIngredientCreateFormDefaults`
3. Guard nulling: only suppress suggestion when ≡ alias **and not** catalog-ready
4. Validation exception: allow submit when ≡ alias **and** catalog-ready
5. UI: pre-fill confirmed field + "Catalog Ready" badge

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/canonical-ingredient-create.ts` | `isCatalogReadyInvoiceName`, `catalogReady` field, guard + validation logic |
| `src/components/canonical-ingredient-create-dialog.tsx` | Pre-fill, badge, catalog-ready copy |
| `src/components/bulk-canonical-ingredient-create-sheet.tsx` | Catalog Ready badge |
| `src/lib/canonical-ingredient-create.test.ts` | Phase 1 tests for 6 herbs + regression |

---

## Files NOT changed

- `canonical-ingredient-display-name.ts` — no token cleanup
- `ingredient-identity.ts` / `ingredient-canonical.ts` — no matching changes
- `invoice-purchase-format.ts` — no purchase unit changes
- Schema / migrations — none

---

## Design decisions

| Decision | Rationale |
|----------|-----------|
| ≤2 token limit | Covers herbs + "Abóbora Butternut"; excludes "Pêra Abacate Hasse" (Phase 2) |
| No digits in alias | Excludes pack weights without ontology |
| Keep suggestion for catalog-ready | User sees what will be created |
| Pre-fill only when catalogReady | Non-catalog suggestions still require explicit Apply |
| Validation exception narrow | Only `isCatalogReadyInvoiceName` paths; shorthand still blocked |

---

## Risks discovered

1. **Salada Ibérica FSTK EMB. 250g** — may show suggestion if normalized fold differs slightly from invoice (scorecard: EMPTY→WEAK). Not catalog-ready; Phase 2 scope.
2. **Birra Peroni…** — long line now shows suggestion (was EMPTY due to guard edge). Not catalog-ready; acceptable side effect.
3. **Two-token limit** — "Abóbora Butternut" passes (2 tokens); three-word produce waits for Phase 2/3.
