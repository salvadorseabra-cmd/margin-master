# "Correct match" — Full Trace

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Rendering

| Layer | Location |
|-------|----------|
| Component | `IngredientCorrectionActions` — `src/components/invoice-ingredient-correction.tsx:42-51` |
| Shown when | `showCorrectionTrigger` — `invoices.tsx:3696-3700` (`showWrongMatch` \| `showPicker` \| unmatched \| suggested) |
| Render gate | `(correctionUi.showConfirm \|\| showCorrectionTrigger)` — `invoices.tsx:3769` |

---

## Handler — Open Only, No Persist

```typescript
// invoices.tsx:3782-3787
onOpenCorrection={() =>
  openIngredientCorrection(renderItem, {
    ingredientMatch,
    possibleIngredientMatch,
  })
}
```

**Does not pass `wasConfirmed`** → defaults to `false` in snapshot (`3230-3247`).

Sets `editingMatchRowId` → same picker opens (`correctionOpen = editingMatchRowId === renderItem.id`).

---

## After Open — Identical to "Matched to"

All picker actions use the same handlers:

- `handleSelectCorrectionIngredient`
- `handleRemoveCorrectionMatch`
- `onCreateIngredient`

**No separate persistence path.**

---

## UI State Driving Visibility

`resolveIngredientCorrectionUiState` — `src/lib/ingredient-correction-memory.ts:412-452`:

| `displayState` | `showConfirm` | `showWrongMatch` (→ Correct match) | Picker chip |
|----------------|---------------|-------------------------------------|-------------|
| `confirmed` | false | **true** | Yes (`matchTargetLabel`) |
| `suggested` | true | **true** | Yes |
| `unmatched` | false | false | Yes (placeholder) |
| rejected | false | false | Yes (`showPicker`) |

---

## Metadata Divergence (Critical)

| Entry point | `wasConfirmed` in snapshot |
|-------------|---------------------------|
| "Matched to" chip | `displayState === "confirmed"` ✅ |
| "Correct match" link | **omitted → false** ❌ |

This affects MLS branch (`reassignMatch` vs `correctMatch`) and subtractive reassign cleanup on confirmed-row corrections opened via the link.
