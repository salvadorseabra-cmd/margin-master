# "Matched to" — Full Trace

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Rendering

| Layer | Location |
|-------|----------|
| Label builder | `buildMatchTargetLabel` / `formatMatchTargetLabel` → `"Matched to: {name}"` — `src/lib/ingredient-match-explanation.ts:316-351` |
| Row resolution | `resolveInvoiceTableRowIngredientMatch` — `src/lib/invoice-ingredient-row-display.ts:19-49` |
| Component | `InvoiceIngredientCorrectionPicker` trigger — `src/routes/invoices.tsx:3719-3755` |
| `matchLabel` prop | `formatMatchTargetLabel(matchTargetLabel)` — `invoices.tsx:3736-3738` |

---

## Open Handler (Chip Click)

```typescript
// invoices.tsx:3722-3728
onOpenChange={(nextOpen) => {
  if (nextOpen) {
    openIngredientCorrection(renderItem, {
      ingredientMatch,
      possibleIngredientMatch,
      wasConfirmed: ingredientMatchState.displayState === "confirmed",
    });
```

`openIngredientCorrection` — `invoices.tsx:3230-3247` — snapshots `{ previousIngredientId, wasConfirmed }` into `correctionSnapshotRef`, sets `editingMatchRowId`.

---

## Picker Actions → Persistence

| Action | Handler | Service chain | Writes |
|--------|---------|---------------|--------|
| **Select ingredient** | `handleSelectCorrectionIngredient` (3254-3297) | `onSelectIngredientForItem` → `selectIngredientForItem` (2095-2167) | `ingredient_aliases` via `persistManualIngredientCorrection` (1914); cost sync (1947); MLS via `dualWriteMatchLifecycleAfterIngredientPersist` (2147); rejected-pair memory (3266); localStorage aliases (2031) |
| **Remove match** | `handleRemoveCorrectionMatch` (3299-3324) | `onUnmatchInvoiceLine` → `unmatchInvoiceLine` (2169-2218) → `unmatchInvoiceLineMatch` | `rejectIngredientMatchPair`; subtractive pricing (`subtractivePricingCleanupForUnmatch`); `markUnmatched` → `invoice_item_matches`; UI map update (2197-2207). **No alias delete.** |
| **Create ingredient** | `onCreateIngredient` (3750) | `openCanonicalIngredientCreate` → `saveCanonicalIngredientFromInvoice` (2250+) | New ingredient + `persistIngredientCorrectionForItem` + MLS `confirmMatch` (2281) |

---

## MLS Branch After Select (Dual-Write)

```typescript
// invoices.tsx:198-236
if (lifecycle?.previousIngredientId && lifecycle.previousIngredientId !== ingredientId) {
  const result = lifecycle.wasConfirmed
    ? await reassignMatch(...)
    : await correctMatch(..., keepConfirmed: false);
  ...
}
const result = await confirmMatch(...); // first-time confirm
```

Chip path for **confirmed** rows sets `wasConfirmed: true` → `reassignMatch` + subtractive reassign cleanup (Phase 5B).

---

## Persistence Summary

| Store | Written? |
|-------|----------|
| `invoice_item_matches` | Yes (dual-write / `markUnmatched` always for unmatch) |
| `ingredient_aliases` | Yes (select/create) |
| `ingredient_price_history` | Yes (select); subtractive delete on unmatch/reassign |
| Correction memory | Yes (reject pair, alias map) |
