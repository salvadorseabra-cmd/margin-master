# External "Create new ingredient" — Trace

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Rendering

| Layer | Location |
|-------|----------|
| Component | `ItemsTable` in `src/routes/invoices.tsx` |
| Button | `invoices.tsx:3777-3790` — label `"Create new ingredient"` |
| Visibility (outer) | `invoices.tsx:3764-3766` — `(correctionUi.showConfirm \|\| unmatchedIngredient \|\| correctionUi.suppressMatchPresentation)` |
| Visibility (button) | `invoices.tsx:3776-3777` — `(unmatchedIngredient \|\| correctionUi.suppressMatchPresentation)` |
| Disabled | `invoices.tsx:3780` — `creatingIngredient \|\| !canCreateIngredient` |
| `canCreateIngredient` | `invoices.tsx:3590` — `!isPlaceholderItemName(renderItem.name)` |

**Visible on:** unmatched rows and rejected rows (`suppressMatchPresentation === true`).

**Hidden on:** confirmed and suggested rows — external button inner condition is false.

---

## Handler Chain

```
onClick → onCreateIngredient(renderItem)
  → openCanonicalIngredientCreate(item, supplier, invoiceId)
  → setCanonicalCreateContext({ item, supplierName, invoiceId })
  → CanonicalIngredientCreateDialog opens
  → saveCanonicalIngredientFromInvoice(values)
  → saveCanonicalIngredientFromInvoiceRow(...)
```

---

## Ingredient Creation

| Step | Location |
|------|----------|
| Defaults | `buildCanonicalIngredientCreateDefaults` |
| Name validation | `validateCanonicalIngredientName` — `bulk-canonical-ingredient-create.ts` |
| Guard/reuse | `guardIngredientCreation` |
| Insert | `persistIngredientFromInvoiceItem(..., { source: "explicit_user" })` |
| Flow origin | `flowOrigin: "explicit_user"` |

---

## Invoice Item Association

| Step | Location |
|------|----------|
| Alias link | `persistIngredientCorrectionForItem` |
| Alias DB write | `persistManualIngredientCorrection` |
| Cost sync | `persistOperationalIngredientCostFromInvoiceLine` |
| Alias map reload | `loadConfirmedIngredientAliasMap` + merge |
| Rejected-pair clear | `setRejectedMatchItemIds` delete |
| localStorage aliases | merge into client map |

---

## MLS Writes

| Step | Location |
|------|----------|
| Post-create dual-write | `dualWriteMatchLifecycleAfterIngredientPersist` |
| Branch | No `lifecycle` param → `confirmMatch` |
| Gating | `VITE_MATCH_LIFECYCLE_DUAL_WRITE` |
