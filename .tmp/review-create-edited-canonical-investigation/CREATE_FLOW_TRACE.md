# Create Flow Trace — Review & Create Edited Canonical

**Date:** 2026-06-15  
**Bocconcino invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968`

---

## Entry point

"Review & Create" banner opens `BulkCanonicalIngredientCreateSheet` (not single dialog).

---

## Flow

```
Review & Create button
  → BulkCanonicalIngredientCreateSheet
  → collectUnmatchedRowsForBulkCreate()
  → User edits row.canonicalName (initialized from suggestedCanonicalName)
  → handleSubmit → onSubmit(submissions[{ itemId, canonicalName }])
  → saveBulkCanonicalIngredientsFromInvoice
  → executeBulkCanonicalIngredientCreate (sequential)
  → saveCanonicalIngredientFromInvoiceRow (per row)
  → validateCanonicalIngredientName(values.canonicalName)
  → buildExplicitCanonicalInsertPayload({ canonicalName: values.canonicalName })
  → guardIngredientCreation(values.canonicalName)
  → persistIngredientFromInvoiceItem(payload, { source: "explicit_user" })
  → persistIngredientCorrectionForItem → ingredient_aliases upsert
  → dualWriteMatchLifecycleAfterIngredientPersist → confirmMatch
  → setIngredientCatalog + load() refresh
```

---

## Key files

| Step | File | Function |
|------|------|----------|
| UI (bulk) | `bulk-canonical-ingredient-create-sheet.tsx` | `initialRowState`, `handleSubmit` |
| UI (single) | `canonical-ingredient-create-dialog.tsx` | `handleSubmit` |
| Defaults | `canonical-ingredient-create.ts` | `buildCanonicalIngredientCreateDefaults` |
| Payload | `canonical-ingredient-create.ts` | `buildExplicitCanonicalInsertPayload` |
| Save | `bulk-canonical-ingredient-create.ts` | `saveCanonicalIngredientFromInvoiceRow` |
| Insert | `ingredient-auto-persist.ts` | `persistIngredientFromInvoiceItem` |
| Alias | `invoices.tsx` | `persistIngredientCorrectionForItem` |
| Match | `invoices.tsx` | `dualWriteMatchLifecycleAfterIngredientPersist` |

---

## Bocconcino defaults

| Invoice alias | suggestedCanonicalName |
|---------------|------------------------|
| `STRACCIATELLA 250 GR` | `Stracciatella 250gr` |
| `MEZZI PACCHERI MANCINI (CX 1KG*6)` | `Mezzi paccheri mancini` |

Bulk sheet pre-fills these into editable fields.
