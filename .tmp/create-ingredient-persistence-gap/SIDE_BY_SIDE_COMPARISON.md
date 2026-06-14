# Side-by-Side Comparison — Create vs Match Existing Ingredient

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Verdict:** **No create-flow persistence gap.** Both paths converge on identical alias/override/MLS writes.

---

## Handler Convergence

```
Create Ingredient:
  saveCanonicalIngredientFromInvoiceRow
    → deps.persistIngredientCorrection (= persistIngredientCorrectionForItem)
         → persistManualIngredientCorrection

Match Existing Ingredient:
  handleSelectCorrectionIngredient
    → persistIngredientCorrectionForItem
         → persistManualIngredientCorrection
```

Both call the same inner function with the same arguments shape: `(item, ingredientId, ingredientName, invoiceId, supplierName)`.

---

## Layer-by-Layer Comparison

| Layer | Create Ingredient | Match Existing Ingredient | Same? |
|-------|-------------------|---------------------------|-------|
| Alias persist handler | `persistIngredientCorrectionForItem` | `persistIngredientCorrectionForItem` | **Yes** |
| Queue | `aliasPersistQueue.enqueue` | `aliasPersistQueue.enqueue` | **Yes** |
| Core service | `persistManualIngredientCorrection` | `persistManualIngredientCorrection` | **Yes** |
| In-memory writes | alias map + operational + override | alias map + operational + override | **Yes** |
| DB write | `upsertConfirmedAlias` → `ingredient_aliases` | `upsertConfirmedAlias` → `ingredient_aliases` | **Yes** |
| Cost sync | `persistOperationalIngredientCostFromInvoiceLine` | `persistOperationalIngredientCostFromInvoiceLine` | **Yes** |
| localStorage | alias map update | alias map update | **Yes** |
| MLS dual-write | `dualWriteMatchLifecycleAfterIngredientPersist` | `dualWriteMatchLifecycleAfterIngredientPersist` | **Yes** |
| MLS action | `confirmMatch` (new create) | `confirmMatch` / `correctMatch` / `reassignMatch` | Partial* |
| Alias key source | `item.name` at save time | `item.name` at save time | **Yes** |
| Normalization | `normalizeInvoiceIngredientName` | `normalizeInvoiceIngredientName` | **Yes** |
| Supplier scope | `supplierName` on invoice | `supplierName` on invoice | **Yes** |

\* MLS lifecycle action differs only when reassigning from a prior ingredient match — not a persistence gap for alias rows.

---

## UX-Only Differences (No Persistence Impact)

| Aspect | Create | Match |
|--------|--------|-------|
| Ingredient insert | Creates new `ingredients` row (or reuses) | Uses existing row |
| Success toast | None | `"Ingredient mapping saved"` |
| Reject prior pair | N/A | Optional on reassign |
| Dialog | `CanonicalIngredientCreateDialog` | Picker select |
| `flowOrigin` | `explicit_user` canonical create | Manual correction |

---

## Records NOT Written Differently

Neither path writes:

- A fuzzy / semantic alias (only exact normalized OCR key)
- A cross-supplier alias (keys are supplier-scoped)
- A canonical-name alias separate from invoice line OCR text
- Brand-token collapsed variants (`Anchoas` vs `Anchovas`, `Alconfrisa` vs `Alconfi sta`)

Both paths suffer equally from exact-key recall limitations on re-read.

---

## Anchoas Evidence

| Action | Alias row created | Same persist chain? |
|--------|-------------------|---------------------|
| Create Ingredient (2026-06-07, Alfonsoita/Avijudo) | Yes — +160ms after ingredient | Yes |
| Manual match Alconfrisa (2026-06-08, AVILUDO) | Yes | Yes |
| Manual match Alconfrista (2026-06-14, AVILUDO) | Yes | Yes |
| Manual match Alconfi sta (2026-06-14, AVILUDO) | Yes | Yes |

10 confirmed aliases in live DB — mix of create-era and manual-match rows, all via the same `persistManualIngredientCorrection` path.

---

## Conclusion

**Classification: NOT `CREATE_FLOW_GAP`**

The observed paradox (Create line doesn't auto-match on re-read; manual match does) is explained by:

1. **Different invoice lines** — Anchoas was created from Avijudo May (`Alfonsoita`), not April AVILUDO Anchovas.
2. **Exact-key recall** — re-read OCR must match a stored alias key; create-time alias key ≠ April re-read OCR key.
3. **OCR variant churn** — manual match fixes one spelling at a time.

See `ROOT_CAUSE.md` and `FINAL_VERDICT.md`.
