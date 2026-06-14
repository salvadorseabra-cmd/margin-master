# Picker "Create ingredient" — Trace

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Rendering

| Layer | Location |
|-------|----------|
| Component | `InvoiceIngredientCorrectionPicker` — `invoice-ingredient-correction-picker.tsx` |
| Create action | `CommandItem` "Create ingredient" — `picker.tsx:115-128` |
| Actions group | Shown when `onSelectNoMatch \|\| onCreateIngredient` — `picker.tsx:100` |
| Wired in ItemsTable | `invoices.tsx:3715-3750` |
| `onCreateIngredient` prop | `invoices.tsx:3745` — `() => onCreateIngredient(renderItem)` |
| `createIngredientDisabled` | `invoices.tsx:3746-3748` — same as external button |

**Picker visible when:** `matchTargetLabel` (confirmed/suggested), `correctionUi.showPicker` (unmatched/rejected), `correctionOpen`, or `unmatchedIngredient`.

---

## Handler Chain

```
CommandItem.onSelect:
  if (createIngredientDisabled) return
  onCreateIngredient()
  onOpenChange(false) → closeIngredientCorrection
  → onCreateIngredient(renderItem)
  → (identical chain from openCanonicalIngredientCreate onward)
```

Parent prop: `openCanonicalIngredientCreate(item, r.supplier_name, r.id)` — `invoices.tsx:2800-2801`.

---

## Ingredient Creation / Association / MLS

Identical to external path from `openCanonicalIngredientCreate` through `confirmMatch`. No branch divergence.

---

## UX-Only Difference

Picker closes itself before opening the dialog. External button does not touch picker state. Both controls can appear together on unmatched/rejected rows.
