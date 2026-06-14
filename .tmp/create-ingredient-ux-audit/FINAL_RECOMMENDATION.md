# Final Recommendation — Create Ingredient UX

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Classification

**A — Same flow, two entry points**

---

## Recommendation

### **CONSOLIDATE_TO_PICKER**

Remove the standalone `"Create new ingredient"` button (`invoices.tsx:3776-3791`) and keep create inside `InvoiceIngredientCorrectionPicker` Actions.

---

## Rationale

1. **Same persistence path** — zero functional loss; mirrors prior `CONSOLIDATE_TO_MATCHED_TO` for Correct match.
2. **Duplicate UX on unmatched/rejected** — chip + external button + picker action; picker Actions already covers create.
3. **Confirmed/suggested already picker-only** — removing external button does not affect those states.
4. **Low risk** — `onCreateIngredient` handler stays; only remove redundant JSX.

---

## Do Not Choose

| Option | Why not |
|--------|---------|
| **KEEP_BOTH** | Duplicate controls on unmatched/rejected with no behavioral benefit |
| **CONSOLIDATE_TO_EXTERNAL_BUTTON** | Loses create for confirmed/suggested (picker-only today); worse discoverability |

---

## Minimal Change (If Implementing)

1. Delete external button block `invoices.tsx:3776-3791` (keep Confirm match).
2. Keep `onCreateIngredient` wiring on picker.
3. Optionally tighten outer wrapper if Confirm-only layout allows.

---

## Preserve

- `openCanonicalIngredientCreate` / `saveCanonicalIngredientFromInvoice`
- Bulk create sheet (separate entry point)
- `Confirm match` one-click path
