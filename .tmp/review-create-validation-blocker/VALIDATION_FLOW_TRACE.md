# Validation Flow Trace — Dialog vs Bulk

## Shared core: `validateCanonicalIngredientName`

File: `src/lib/canonical-ingredient-create.ts`

Order of checks:

1. `isNonFoodInvoiceLine(name)` → reject non-food
2. Empty name → reject
3. **Alias-equality guard** (Phase 1 catalogReady exception):
   - If `confirmedNameMatchesInvoiceAlias(name, invoiceAlias)` AND NOT `isCatalogReadyInvoiceName(invoiceAlias)` → reject
   - Phase 2 cleaned names (e.g. `"Pêra abacate"` vs alias `"Pêra Abacate Hasse"`) do **not** match → **skipped**
4. Normalization empty/unknown → reject
5. **`shouldBlockCanonicalNameOnCreate(name)`** → reject with operational hint ← **BUG FIRES HERE**
6. OK

---

## Single-row dialog path

### Open / pre-fill

`invoices.tsx` → `buildCanonicalIngredientCreateDefaults` → `CanonicalIngredientCreateDialog`

`canonical-ingredient-create-dialog.tsx` useEffect:

- Pre-fills `confirmedCanonicalName` **only** when `defaults.catalogReady && defaults.suggestedCanonicalName`
- Phase 2 rows (`catalogReady: false`): field starts empty; user clicks "Apply suggestion" or types manually

### Submit (UI gate #1)

`CanonicalIngredientCreateDialog.handleSubmit` → `validateCanonicalIngredientName(confirmedCanonicalName, { invoiceAlias })`

### Save (gates #2 and #3)

`saveCanonicalIngredientFromInvoice` → `saveCanonicalIngredientFromInvoiceRow` → `validateCanonicalIngredientName` again → `buildExplicitCanonicalInsertPayload` → `validateCanonicalIngredientName` again → `persistIngredientFromInvoiceItem` → `shouldBlockCanonicalNameOnCreate(payload.name)` (would block even if UI validation were patched locally)

---

## Bulk create path

### Open / pre-fill

`collectUnmatchedRowsForBulkCreate` → `buildCanonicalIngredientCreateDefaults` per row

`BulkCanonicalIngredientCreateSheet.initialRowState`:

- Always sets `canonicalName: suggestedCanonicalName` (no `catalogReady` gate)

### Submit (UI gate #1)

`BulkCanonicalIngredientCreateSheet.handleSubmit` → `validateCanonicalIngredientName(row.canonicalName, { invoiceAlias })` per selected row

### Save (gates #2–#4)

`saveBulkCanonicalIngredientsFromInvoice` → `executeBulkCanonicalIngredientCreate` → `saveCanonicalIngredientFromInvoiceRow` (same chain as dialog)

---

## Suggestion vs validation asymmetry

| Step | Phase 1 (e.g. Tomilho) | Phase 2 (e.g. Pêra Abacate Hasse) |
|------|------------------------|-----------------------------------|
| `isCatalogReadyInvoiceName(invoice)` | true | false (3 tokens) |
| `suggestedCanonicalName` | display-cased invoice | cleaned via `formatCanonicalIngredientDisplayName` |
| Alias-equality null guard | N/A (catalogReady) | suggestion kept (cleaned ≠ alias) |
| `shouldBlockCanonicalNameOnCreate(suggestion)` | false | **true** (via `.toUpperCase()` heuristic) |
| Dialog pre-fill | yes | no (must Apply) |
| Bulk pre-fill | yes | yes |
