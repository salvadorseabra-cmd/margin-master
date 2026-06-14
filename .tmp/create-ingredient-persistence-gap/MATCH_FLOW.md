# Match Existing Ingredient Flow — Persistence Chain

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Focus:** Alias / override / MLS writes after user selects an existing ingredient for an invoice line

---

## Entry Points

| Entry | Handler |
|-------|---------|
| Picker ingredient select | `handleSelectCorrectionIngredient` |
| Confirm suggestion | Same persist chain via `onSelectIngredientForItem` / `selectIngredientForItem` |

Both converge on `persistIngredientCorrectionForItem`.

---

## Full Persistence Chain

```
handleSelectCorrectionIngredient
  → onSelectIngredientForItem / selectIngredientForItem
  → persistIngredientCorrectionForItem
       → aliasPersistQueue.enqueue
       → persistManualIngredientCorrection
            → applyManualIngredientCorrection
                 ├─ rememberConfirmedAliasInMap
                 ├─ rememberOperationalAlias
                 └─ rememberIngredientMatchOverride
            → upsertConfirmedAlias → ingredient_aliases (DB)
            → persistOperationalIngredientCostFromInvoiceLine
            → localStorage alias map update
  → (on success) dualWriteMatchLifecycleAfterIngredientPersist
       → confirmMatch | correctMatch | reassignMatch (depends on prior match state)
  → toast("Ingredient mapping saved")  [picker path only]
  → void load()
```

---

## Key Code Reference

```2138:2153:src/routes/invoices.tsx
    const result = await persistIngredientCorrectionForItem(
      item,
      ingredientId,
      ingredient.name ?? ingredient.normalized_name ?? "",
      invoiceId,
      supplierName,
    );
    if (result.ok) {
      if (user) {
        void dualWriteMatchLifecycleAfterIngredientPersist({
          item,
          ingredientId,
          invoiceId,
          userId: user.id,
          lifecycle,
        });
```

Toast fires only on picker/correction path success:

```3290:3292:src/routes/invoices.tsx
    if (result.ok) {
      toast("Ingredient mapping saved");
```

Confirm-suggestion path uses the same persist chain but does **not** show this toast.

---

## What Gets Written

Identical triple-write + DB upsert as Create Ingredient:

| Layer | Record |
|-------|--------|
| `ingredient_aliases` | Confirmed alias for `item.name` at save time |
| In-memory alias map | Session lookup |
| In-memory override map | Matcher step-1 override |
| Operational alias memory | Recurring shorthand |
| `localStorage` | Browser-persisted alias map |
| `invoice_item_matches` | MLS dual-write (`confirmMatch` / `correctMatch` / `reassignMatch`) |
| Price / cost | Operational cost from invoice line |

Core service:

```135:156:src/lib/ingredient-correction-memory.ts
  const nextConfirmedAliases = rememberConfirmedAliasInMap(...);
  rememberOperationalAlias(..., "manual_confirmation", MANUAL_CONFIRMATION_CONFIDENCE);
  rememberIngredientMatchOverride(...);
```

---

## UX Differences vs Create (Persistence Identical)

| Aspect | Match Existing | Create Ingredient |
|--------|----------------|-------------------|
| Ingredient row | Select existing | Insert new (or reuse) |
| Alias persist handler | `persistIngredientCorrectionForItem` | **Same** (via deps) |
| Core service | `persistManualIngredientCorrection` | **Same** |
| MLS on reassign | `reassignMatch` / `correctMatch` if prior match | `confirmMatch` (new) |
| Toast | `"Ingredient mapping saved"` | None |
| Optional reject | `rejectIngredientMatchPair` on reassign | N/A |

---

## Anchoas Case — Manual Match Persists Same Records

Example: user matches April AVILUDO line `Filete de Anchovas Alconfrista Lt 495 g` → Anchoas

| Layer | Record |
|-------|--------|
| `ingredient_aliases` | `AVILUDO::filete de anchovas alconfrista 495` → `c811f67f…` |
| Override map | Same key hydrated at page load |
| MLS | `confirmed-override` on re-read when OCR matches that spelling |

Manual match on **Alconfrista** (2026-06-14) auto-matches on next re-read **only when OCR returns `Alconfrista`**. Other spellings (`Alconfirosa`, `Alconfirsta`) remain unmatched until separately confirmed.

See `ANCHOAS_ALIAS_AUDIT.md` for full alias table and matcher simulation.
