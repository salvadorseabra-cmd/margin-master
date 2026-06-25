# Match Lifecycle Responsibility Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25

## Executive Summary

The codebase implements **Option B**: recipe costing is ingredient-keyed and never touches `invoice_item_matches`. Matching is an invoice-line → ingredient_id concern in procurement/review/operational-overlay layers. **Reject** wiring persisted matches into Recipe Cost Resolution; enable READ_CUTOVER in **operational overlay builders** (`loadOperationalIngredientCostOverlay`) instead.

## Final Decision

| Question | Answer |
|----------|--------|
| Should Recipe Costing know `invoice_item_matches`? | **NO** |
| Wire persisted matches into Recipe Cost Resolution? | **NO** — reject |
| Recipe Costing independent of Match Lifecycle? | **YES** (already) |
| READ_CUTOVER without recipe costing changes? | **YES** |
| Match finished after READ_CUTOVER? | **NO** — overlay builders + history gate remain |

## Architectural Boundary

```
MATCHING DOMAIN: invoice line → ingredient_id
  Consumers: Invoice Review, Validation, Catalog Review, overlay builders

RECIPE COSTING DOMAIN: ingredient_id → unit cost → line €
  Consumers: Editor, Summary, PDF
```

Matching ends at operational overlay construction. Recipe costing starts at `ingredient_id`.

## READ_CUTOVER Impact

Changes: Invoice Review, unresolved counts, validation findings, Catalog Review.
Does **not** change: recipe costing, ingredient detail scan, margin alerts (until overlay wired).

## Recommended Order

1. Enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER` in VL
2. Wire `persistedMatchByItemId` into `loadOperationalIngredientCostOverlay` (operational layer only)
3. Gate `ingredient_price_history` on confirmed match
4. Retire virtual read after sustained parity

**Confidence: 88%**
