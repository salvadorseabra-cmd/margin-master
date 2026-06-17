# Final Verdict

## Correct metric matrix

| Feature | Correct metric | Why |
|---------|----------------|-----|
| **Last Paid** | Invoice line total | User validates against invoice — "what did I pay last time?" |
| **Purchase History** | Invoice line total | Each row is one invoice line — show cash paid |
| **Best Buy** | Normalized comparable price | Compare unit economics across suppliers/dates/pack sizes |
| **Highest Paid** | Normalized comparable price | Same — find worst per-unit value, not largest invoice line |

---

## Did the refactor break Best Buy / Highest Paid?

**Yes — conditionally.**

When all purchases share the same quantity and pack structure (e.g. bacon always 1 kg, Peroni always qty 24), line-total ranking often matches normalized ranking by accident.

When quantity varies (San Pellegrino 1 cx @ €25.74 vs 2 cx @ €38.56), line-total comparison **inverts** the true best value.

**Root cause:** One shared `priceLabel` drives both Purchase History display and all intelligence. `formatPurchasePrice` flipped priority from `unitPrice` → `lineTotal` without adding a separate comparable field for min/max logic.

---

## Implementation status vs recommendation

| Feature | Current source | Recommended source | Change needed? |
|----------|----------------|-------------------|----------------|
| Last Paid | `invoice_items.total` via `lastPaidTotal` | Invoice line total | **No** |
| Purchase History | `invoice_items.total` via `priceLabel` | Invoice line total | **No** |
| Best Buy | `parsePriceLabel(priceLabel)` where priceLabel = line total | Normalized comparable price (`unit_price`, or per-case/bottle/kg/L via `recipeOperationalCostFieldsFromInvoiceLine`) | **Yes** |
| Highest Paid | Same as Best Buy | Same normalized metric as Best Buy | **Yes** |

---

## Recommended fix shape (presentation-layer, no costing logic change)

1. Keep `priceLabel` = invoice line total for Last Paid and Purchase History display.
2. Add `comparablePrice` (numeric) and optionally `comparablePriceLabel` (formatted) on `RecentPurchaseRow` or `IngredientMatchedInvoiceProduct`.
3. Populate from existing normalization in `invoice-purchase-price-semantics.ts` — do not change recipe or catalog costing math.
4. Switch `buildIngredientPurchaseInsights`, highlights, trends, and supplier signals to use `comparablePrice` instead of `parsePriceLabel(priceLabel)`.

This preserves the UI refactor intent (invoice totals for validation) while restoring correct procurement intelligence semantics.

---

## Cross-agent synthesis

| Workstream | Outcome |
|------------|---------|
| [UI refactor](72701f70-496b-4a2b-a214-20d0254609ab) | Correctly separated Last Paid / Purchase History onto invoice totals; added Operational Cost section |
| [Semantics audit](19c50cf0-2477-48e8-925f-0fa10dd6cae9) | Identified unintended regression in Best Buy / Highest Paid via shared `priceLabel` |

**Net:** Partial success — audit surfaces fixed, intelligence surfaces need a follow-up fix to split display vs comparison metrics.
