# Dead Code Audit — Correction UI

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Active Components

| Item | Status | Notes |
|------|--------|-------|
| `InvoiceIngredientCorrectionPicker` | **Active** | Sole correction UI surface |
| `IngredientCorrectionActions` | **Active** | `Confirm match` still needed for suggested rows |
| `"Create new ingredient"` standalone button | **Active** | Unmatched/rejected rows — `invoices.tsx:3789-3803`; duplicates picker action |

---

## Redundant / Unused

| Item | Status | Notes |
|------|--------|-------|
| `"Correct match"` link | **Redundant opener** | Same picker always visible when link is (`showIngredientMatchPicker` at 3701-3705 covers all `showCorrectionTrigger` cases) |
| `INVOICE_INGREDIENT_CORRECTION_NO_MATCH` / `isInvoiceIngredientCorrectionNoMatch` | **Unused** | Remove match uses `onSelectNoMatch` callback, not sentinel — `invoice-ingredient-correction-picker.tsx:21-26` |

---

## Can "Correct match" Be Removed Safely?

**Yes, with low risk**, if `Confirm match` is kept for suggested one-click confirm:

- Confirmed / suggested / unmatched / rejected rows already show the picker chip (label or placeholder).
- User tested remove-via-chip successfully.
- Removing the link eliminates duplicate UX **and** the `wasConfirmed` snapshot bug on the link entry path.

**Do not remove** `IngredientCorrectionActions` entirely — keep `Confirm match`.

---

## Minimal Fix Alternative (If Keeping Both Temporarily)

Pass `wasConfirmed: ingredientMatchState.displayState === "confirmed"` in `onOpenCorrection` — same as chip path (`invoices.tsx:3726`).
