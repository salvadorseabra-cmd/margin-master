# Root Cause Summary — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · live DB via `.env.local` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

---

## Issue matrix

| Issue | Root cause | Verdict |
|---|---|---|
| Atum +316% spike | Multi-`un` denominator on Apr line (`6.29÷2=3.145`) chained to May full-bag price (`13.10`); compares half-bag vs full-bag, not €/kg | **Requires fix** |
| Atum `ingredient_unit=g` | Catalog unit stamped on €/un operational values | **Requires fix** |
| Mozzarella duplicate rows | No DB unique on `(invoice_id, ingredient_id)`; two inserts for same Aviludo invoice | **Requires fix** |
| Mozzarella 0.812 poison row | `backfillIngredientPriceHistoryFromInvoices` includes **suggested** matches; 125g×8 balls priced on 2kg canonical | **Active contamination** |
| `created_at` 2023 vs invoice 2026 | History stamped at first insert from then-current `invoice_date`; invoice later corrected; refresh preserves `created_at` | **Historical artifact** + **Active contamination** (ordering) |
| `current_price` vs history | Catalog from latest **confirmed** persist; history queries sort by `created_at DESC` | Atum: catalog OK, queries wrong · Mozzarella: catalog OK, history poisoned |

---

## Code paths confirmed

Backfill allows `suggested`; live extract gate blocks bare `exact`/`semantic` when flag ON:

```168:171:src/lib/ingredient-price-history-backfill.ts
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      result.skippedUnmatched += 1;
      continue;
    }
```

Atum Apr: `resolveCountablePurchaseQuantityForCost` returns row qty for `un`, dividing €6.29 again:

```426:455:src/lib/invoice-purchase-price-semantics.ts
export function resolveCountablePurchaseQuantityForCost(...) {
  // ...
  if (rowUnit === "un" || ...) {
    return rowQty;  // ← Atum Apr: returns 2, divides €6.29 again
  }
```

History queries ignore invoice chronology:

```426:437:src/lib/ingredient-price-history.ts
export async function fetchLatestHistoryNewPrice(...) {
  // ...
  .order("created_at", { ascending: false })  // ← ignores invoice chronology
```

---

## Cross-reference

| Deliverable | Scope |
|---|---|
| [ATUM_AUDIT.md](./ATUM_AUDIT.md) | Row-by-row Atum trace, +316% spike mechanics |
| [MOZZARELLA_AUDIT.md](./MOZZARELLA_AUDIT.md) | Duplicates, suggested-match poison, match lifecycle |
| [CREATED_AT_CORRUPTION.md](./CREATED_AT_CORRUPTION.md) | 4 May rows with 2023 timestamps |
| [CURRENT_PRICE_AUDIT.md](./CURRENT_PRICE_AUDIT.md) | Catalog vs history ordering divergence |
| [FINAL_VERDICT.md](./FINAL_VERDICT.md) | Per-issue tags and fix priority |
