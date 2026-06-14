# Create Ingredient Flow — Persistence Chain

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Focus:** Alias / override / MLS writes after canonical ingredient creation from invoice line

---

## Entry Points

Both UI paths converge on the same handler:

| Entry | Handler |
|-------|---------|
| Picker "Create ingredient" | `openCanonicalIngredientCreate(renderItem)` |
| External "Create new ingredient" button | `openCanonicalIngredientCreate(renderItem)` |

Dialog: `CanonicalIngredientCreateDialog`  
Save: `saveCanonicalIngredientFromInvoice` → `saveCanonicalIngredientFromInvoiceRow`

Prior audit: `.tmp/create-ingredient-ux-audit/FLOW_COMPARISON.md` — classification **A: same flow, two entry points**.

---

## Full Persistence Chain

```
openCanonicalIngredientCreate
  → CanonicalIngredientCreateDialog (user submits canonical name + units)
  → saveCanonicalIngredientFromInvoice
  → saveCanonicalIngredientFromInvoiceRow
       → persistIngredientFromInvoiceItem (new ingredient) OR reuse guard
       → deps.persistIngredientCorrection (= persistIngredientCorrectionForItem)
            → aliasPersistQueue.enqueue
            → persistManualIngredientCorrection
                 → applyManualIngredientCorrection
                      ├─ rememberConfirmedAliasInMap
                      ├─ rememberOperationalAlias
                      └─ rememberIngredientMatchOverride
                 → upsertConfirmedAlias → ingredient_aliases (DB)
                 → persistOperationalIngredientCostFromInvoiceLine
                 → localStorage alias map update
       → dualWriteMatchLifecycleAfterIngredientPersist → confirmMatch → invoice_item_matches
       → void load() (refresh invoice)
```

---

## Key Code References

Create **always** calls alias persist after ingredient insert/reuse:

```276:287:src/lib/bulk-canonical-ingredient-create.ts
    traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:alias-persist-call", {
      invoiceAlias: item.name,
      ingredientId,
      ingredientReused,
    });
    const aliasResult = await deps.persistIngredientCorrection(
      item,
      ingredientId,
      ingredientName,
      invoiceId,
      supplierName,
    );
```

Wiring in `invoices.tsx` passes `persistIngredientCorrectionForItem` as the dependency:

```2265:2287:src/routes/invoices.tsx
      const result = await saveCanonicalIngredientFromInvoiceRow(
        {
          supabase,
          userId: user.id,
          catalog: ingredientCatalog,
          isGenericUnit,
          persistIngredientCorrection: persistIngredientCorrectionForItem,
        },
        { item, supplierName, invoiceId: canonicalInvoiceId },
        values,
      );
      // ...
      void dualWriteMatchLifecycleAfterIngredientPersist({
        item,
        ingredientId: result.ingredientId,
        invoiceId: canonicalInvoiceId,
        userId: user.id,
        matchKind: "manual",
      });
```

---

## What Gets Written

| Layer | Record | When |
|-------|--------|------|
| `ingredients` | New canonical row (or reuse existing) | Before alias persist |
| `ingredient_aliases` | Confirmed alias keyed to `item.name` at save time | `upsertConfirmedAlias` |
| In-memory alias map | Session lookup | `rememberConfirmedAliasInMap` |
| In-memory override map | Matcher step-1 override | `rememberIngredientMatchOverride` |
| Operational alias memory | Recurring shorthand | `rememberOperationalAlias` |
| `localStorage` | Browser-persisted alias map | After DB upsert |
| `invoice_item_matches` | MLS `confirmMatch` (fire-and-forget) | `dualWriteMatchLifecycleAfterIngredientPersist` |
| Price / cost | Operational cost from invoice line | `persistOperationalIngredientCostFromInvoiceLine` |

---

## Alias Key Source

The alias key is derived from **`item.name` at save time** (the OCR text on the invoice line being created from), normalized via `normalizeInvoiceIngredientName`, scoped by supplier name.

There is no separate "canonical name" alias — only the invoice line OCR text is persisted as the alias.

---

## Anchoas Case — Create DID Persist Alias

Live DB evidence (queried 2026-06-14T17:34Z):

| Event | Timestamp |
|-------|-----------|
| `ingredients` row created (`c811f67f…`) | `2026-06-07T23:42:41.173Z` |
| First alias row (Alfonsoita, Avijudo) | `2026-06-07T23:42:41.333Z` (**+160ms**) |

The 160ms gap proves Create Ingredient wrote an alias in the same session as ingredient creation — not a separate manual match step.

Original create line:

| Field | Value |
|-------|-------|
| OCR text | `Filete de Anchoas Alfonsoita L4 495 g` |
| Supplier | **Avijudo** (May review) |
| Normalized key | `filete de anchoas alfonsoita 495` |
| Lookup key | `Avijudo::filete de anchoas alfonsoita 495` |

**Not** the April AVILUDO Anchovas line — see `ANCHOAS_ALIAS_AUDIT.md`.

---

## Failure Mode (Not a Create Bug)

If alias persist fails after ingredient insert, Create returns an error:

> "Ingredient saved but invoice alias could not be linked. Try choosing the ingredient manually."

For Anchoas, alias persist succeeded (DB row exists). Re-read failures on other invoice lines are **recall** failures (exact-key mismatch), not missing create-time writes.
