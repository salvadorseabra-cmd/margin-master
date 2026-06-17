# Classification — Non-Ingredient Invoice Lines

**Date:** 2026-06-15

## Recargo por combustibili

| Field | Value |
|-------|-------|
| Classification | **Fuel surcharge / non-food invoice line** |
| Pattern | `/\brecarg[ao]\b.*\bcombustib/i` |
| Not | Service fee, delivery, pallet, deposit, unknown |

Matches OCR variants: `Recargo por combustibili`, `Recargo por combustible`, `Recarga por combustivel`.

Function: `isNonFoodInvoiceLine()` in `canonical-ingredient-create.ts`.
