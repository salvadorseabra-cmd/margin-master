# Intelligence Audit — Normalized vs Invoice Totals

## buildIngredientPurchaseInsights

**File:** `src/lib/ingredient-detail-panel.ts`

- Computes Best Buy (min) and Highest Paid (max) from `parsePriceLabel(row.priceLabel)`
- `priceLabel` now holds line total (post-refactor)
- **Requires:** normalized comparable price
- **Currently uses:** invoice line total (regression)

---

## Related functions in ingredient-detail-panel.ts

| Function | Purpose | Needs normalized? |
|----------|---------|-------------------|
| `findCheapestPurchaseItemId` | Highlight cheapest row in history | **Yes** |
| `findMostExpensivePurchaseItemId` | Highlight priciest row | **Yes** |
| `purchaseHistoryPriceTextClassName` | Green/red price styling | **Yes** |
| `derivePurchaseTimelineLabels` | Timeline annotations | **Yes** |
| `buildIngredientDeltaIntelligence` | Price shift detection | **Yes** |
| `deriveIngredientCompactTrendState` | Trend badges | **Yes** |
| `cheapestSupplierLabel` | Supplier comparison | **Yes** |
| `bestSupplierChangedRecently` | Supplier shift signal | **Yes** |

All consume `RecentPurchaseRow.priceLabel` — single field, no split between display and comparison.

---

## buildOperationalInsightCards.ts

| Function / logic | Needs normalized? |
|------------------|-------------------|
| Volatility range (min/max spread) | **Yes** |
| Latest vs prior price delta | **Yes** |
| Best-row lookup for insight cards | **Yes** |

---

## buildIngredientOperationalSignals.ts

| Function / logic | Needs normalized? |
|------------------|-------------------|
| `parsePriceLabel` on purchase rows | **Yes** |
| Supplier price variation | **Yes** |
| Recent price shift detection | **Yes** |
| Cheapest supplier derivation | **Yes** |

---

## Features correctly on invoice totals

| Feature | Source | Status |
|---------|--------|--------|
| Last Paid (list column) | `lastPaidTotal` from `invoice_items.total` | ✓ Correct |
| Purchase History display | `priceLabel` = line total | ✓ Correct |
| Operational Cost panel | `buildIngredientOperationalCostPresentation` — catalog fields | ✓ Correct (separate section) |

---

## Already-normalized elsewhere (unchanged by refactor)

| Surface | Source |
|---------|--------|
| `ingredients.current_price` | Catalog operational pack price |
| Operational Cost section | `current_price`, `purchase_quantity`, `purchase_unit`, name parsing |
| Exposure drill-down | `ingredient_price_history.new_price` |
| Recipe costing | `recipeOperationalCostFieldsFromInvoiceLine`, `computeEffectiveUsableCost` in `invoice-purchase-price-semantics.ts` |

---

## Opportunity / supplier comparison logic

Opportunity signals and supplier comparison all flow through the same `priceLabel` → `parsePriceLabel` path. No separate branch preserves normalized comparison after the refactor.

**Existing normalization utilities (not wired to Best Buy):**

- `recipeOperationalCostFieldsFromInvoiceLine` — `invoice-purchase-price-semantics.ts`
- `computeEffectiveUsableCost` — usable-quantity-aware cost
- `operationalCostFieldsFromInvoiceLine` — used in auto-persist, not purchase insights

---

## Conclusion

| Category | Features | Metric |
|----------|----------|--------|
| Invoice audit trail | Last Paid, Purchase History | Invoice line total |
| Procurement intelligence | Best Buy, Highest Paid, highlights, trends, supplier signals | Normalized comparable price |

The refactor correctly split display for audit surfaces but did not split the shared `priceLabel` field used by intelligence.
