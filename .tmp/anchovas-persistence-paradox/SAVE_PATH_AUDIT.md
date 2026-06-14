# Save Path Audit — "Ingredient mapping saved"

**Generated:** 2026-06-14  
**Investigation:** Anchovas persistence paradox  
**Mode:** READ-ONLY code trace + live VL validation  
**Related:** `.tmp/anchoas-reread-investigation/`, `.tmp/reread-determinism-investigation/`

---

## Toast Origin

The toast **"Ingredient mapping saved"** fires only from the **picker/correction path**, not from the confirm-suggestion path.

```3290:3292:src/routes/invoices.tsx
    if (result.ok) {
      toast("Ingredient mapping saved");
      return;
```

| UI action | Handler | Toast? |
|-----------|---------|--------|
| Pick ingredient from catalog (correction) | `handleSelectCorrectionIngredient` → `onSelectIngredientForItem` | **Yes** |
| Confirm existing suggestion | `confirmIngredientMatch` → same persist chain | **No** |

Both paths converge on `persistIngredientCorrectionForItem` → `persistManualIngredientCorrection`.

---

## Handler Chain (Picker Path)

```
UI: user picks ingredient from catalog
  → handleSelectCorrectionIngredient (invoices.tsx)
  → onSelectIngredientForItem / selectIngredientForItem
  → aliasPersistQueue.enqueue (serializes concurrent writes)
  → persistIngredientCorrectionForItem
  → persistManualIngredientCorrection (ingredient-correction-memory.ts)
       ├─ applyManualIngredientCorrection
       │    ├─ rememberConfirmedAliasInMap     → in-memory IngredientAliasMap
       │    ├─ rememberOperationalAlias        → operational alias memory
       │    └─ rememberIngredientMatchOverride → ingredientMatchOverrides map
       ├─ upsertConfirmedAlias                 → DB: ingredient_aliases INSERT/UPDATE
       ├─ loadConfirmedIngredientAliasMap + merge
       ├─ hydrateOperationalAliasMemoryFromConfirmedMap
       ├─ localStorage: marginly:invoice-ingredient-aliases:{userId}
       └─ persistOperationalIngredientCostFromInvoiceLine (may update ingredients.current_price)
  → dualWriteMatchLifecycleAfterIngredientPersist
       ├─ confirmMatch / correctMatch (match-lifecycle-service.ts)
       └─ invoice_item_matches INSERT/UPDATE (fire-and-forget)
  → toast("Ingredient mapping saved")
```

---

## What Gets Written Where

| Layer | Table / Store | Key shape | Durable? |
|-------|---------------|-----------|----------|
| **Primary DB alias** | `ingredient_aliases` | `alias_name`, `normalized_alias`, `supplier_name`, `confirmed_by_user=true` | ✅ Yes |
| **MLS dual-write** | `invoice_item_matches` | `status=confirmed`, `match_kind=manual` | ✅ Yes (async) |
| **In-memory alias map** | React state `confirmedAliases` | `SUPPLIER::normalized_alias` | Session only |
| **Override map** | `ingredientMatchOverrides` | `SUPPLIER::normalized_alias` | Session only (re-hydrated from DB aliases at page load) |
| **Operational alias** | In-memory operational memory | Line text + supplier | Session only |
| **localStorage** | `marginly:invoice-ingredient-aliases:{userId}` | Serialized alias map | Browser-local |
| **Reject pairs** | localStorage | Cleared on successful confirm for that line | Browser-local |

---

## applyManualIngredientCorrection (Triple Write)

Every manual confirm writes **all three** memory layers atomically in application code:

```135:156:src/lib/ingredient-correction-memory.ts
  const nextConfirmedAliases = rememberConfirmedAliasInMap(...);
  rememberOperationalAlias(..., "manual_confirmation", MANUAL_CONFIRMATION_CONFIDENCE);
  rememberIngredientMatchOverride(...);
```

The alias key is built from **exact OCR text at confirm time** via `buildManualIngredientCorrectionKeys`. There is no fuzzy brand-token canonicalization — confirming `Alconfrista` does not create keys for `Alconfirosa`.

---

## Page Load Hydration (Re-Read Prep)

On invoice page load / re-extract, confirmed DB aliases are hydrated into the override map:

```1029:1038:src/routes/invoices.tsx
        hydrateIngredientMatchOverridesFromAliasRows(aliasRows, catalog);
```

This means at match time, step 1 (override lookup) and step 3 (DB alias lookup) share the same keys. Override wins first and returns `confirmed-override` kind even when alias would also hit.

---

## Confirm-Suggestion Path (Same Persist, No Toast)

`confirmIngredientMatch` calls the same `persistIngredientCorrectionForItem` chain. Live evidence: Anchovas rows show `match_kind: confirmed-override` (not `confirmed-alias`) because override is consulted first in the matcher pipeline.

---

## Re-Read Does NOT Re-Use Prior invoice_item_id

Re-read CASCADE-deletes `invoice_items` and `invoice_item_matches`, then re-seeds from fresh OCR + current memory snapshot. Prior item UUID confirmations are **not** carried forward (T8 preserve policy not implemented).

---

## Conclusion

**"Ingredient mapping saved" does persist.** The write path is correct and complete:

1. `ingredient_aliases` row (durable)
2. In-memory override + operational alias + alias map
3. MLS dual-write to `invoice_item_matches`
4. localStorage alias map update

The paradox is **not** a save-path failure. Recall on re-read depends on whether fresh OCR text hits an exact alias/override key — see `MEMORY_SOURCE_AUDIT.md` and `ROOT_CAUSE.md`.
