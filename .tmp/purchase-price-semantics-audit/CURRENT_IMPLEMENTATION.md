# Current Implementation — Before vs After Refactor

## Data pipeline (shared)

```
invoice_items (DB)
  → loadInvoiceItemsForMatchedProductScan
  → buildMatchedInvoiceProductsFromScan
       stores: unitPrice, lineTotal, quantity, unit, productName, …
  → buildRecentPurchases (ingredient-purchase-memory.ts)
       priceLabel = formatPurchasePrice(product)
  → intelligence layer parses priceLabel via parsePriceLabel()
```

---

## Ingredient list — Last Paid

| | BEFORE (committed HEAD) | AFTER (refactor) |
|---|-------------------------|------------------|
| **Column label** | Pack price | Last paid |
| **Source field** | `ingredients.current_price` | `invoice_items.total` |
| **File** | `src/routes/ingredients.tsx` | same |
| **Function** | Direct catalog field render | `lastPurchaseGlanceByIngredientId[id].lastPaidTotal` → `formatLastPaidTotalGlance` |
| **Intermediate** | — | `buildLatestPurchaseGlanceByIngredientIdFromScan` in `ingredient-operational-intelligence.ts` |

---

## Purchase History table

| | BEFORE | AFTER |
|---|--------|-------|
| **Column label** | Price / unit | Purchase price |
| **Source field** | `invoice_items.unit_price` (preferred) | `invoice_items.total` (preferred) |
| **File** | `src/lib/ingredient-purchase-memory.ts` | same |
| **Function** | `formatPurchasePrice` — unitPrice first | `formatPurchasePrice` — lineTotal first |
| **Display** | `src/components/ingredient-detail-operational-layout.tsx` | same (column rename) |

```typescript
// AFTER — formatPurchasePrice priority flip
function formatPurchasePrice(product: IngredientMatchedInvoiceProduct): string {
  if (product.lineTotal != null && Number.isFinite(product.lineTotal)) {
    return formatCurrency(product.lineTotal);
  }
  if (product.unitPrice != null && Number.isFinite(product.unitPrice)) {
    return formatCurrency(product.unitPrice);
  }
  return "—";
}
```

---

## Best Buy / Highest Paid

| | BEFORE | AFTER |
|---|--------|-------|
| **Source field** | `unitPrice` via shared `priceLabel` | `lineTotal` via same `priceLabel` |
| **File** | `src/lib/ingredient-detail-panel.ts` | same |
| **Function** | `buildIngredientPurchaseInsights` | same (unchanged logic) |
| **Parsing** | `parsePriceLabel(row.priceLabel)` | same — but label now holds line total |

Comment in code still says "min / max **unit price**" but implementation reads whatever `priceLabel` contains:

```typescript
/** Best / worst purchase lines from recent purchase memory (min / max unit price). */
export function buildIngredientPurchaseInsights(purchases) {
  const price = parsePriceLabel(row.priceLabel);
  // min/max on parsed value
}
```

**Verdict:** Best Buy / Highest Paid inherited the display change unintentionally. No separate comparable-price field exists on `RecentPurchaseRow`.

---

## Downstream consumers of `priceLabel`

All parse the same string — now line totals:

| File | Functions |
|------|-----------|
| `ingredient-detail-panel.ts` | `buildIngredientPurchaseInsights`, `findCheapestPurchaseItemId`, `findMostExpensivePurchaseItemId`, `purchaseHistoryPriceTextClassName`, `derivePurchaseTimelineLabels`, `buildIngredientDeltaIntelligence`, `deriveIngredientCompactTrendState` |
| `buildOperationalInsightCards.ts` | volatility, trend, best-row lookup |
| `buildIngredientOperationalSignals.ts` | supplier comparison, price shift detection |
