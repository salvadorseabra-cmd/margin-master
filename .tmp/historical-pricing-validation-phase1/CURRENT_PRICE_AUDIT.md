# Current Price Audit — Historical Pricing Validation Phase 1

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14

## Catalog vs history alignment

| Ingredient | catalog `current_price` | Latest by **invoice chronology** | Latest by **`created_at DESC`** | Aligned? |
|---|---|---|---|---|
| Pepino | 22.49 (→3.748 op) | 3.748 | 3.748 | ✅ |
| Arroz | 13.95 (→1.162 op) | 1.162 | 1.121 (April) | ⚠️ catalog OK, queries wrong |
| Anchoas | 9.99 (→4.995 op) | 4.995 | 4.745 (April) | ⚠️ catalog OK, queries wrong |
| Atum | 13.10 | 13.10 | **3.145** (April) | ❌ revert/query would understate |
| Mozzarella | 13.69 | 0.812 (May Bocconcino) | 0.812 | ❌ catalog ≠ chronology-latest |
| Gema | 10.49 (→1.748 op) | 1.748 | 1.698 (April) | ⚠️ catalog OK, queries wrong |

## Operational cost derivation

Catalog operational cost = `operationalUnitPriceForPriceHistory(current_price, purchase_quantity)`  
History operational cost = `new_price` from latest linked row

For **VALID** ingredients (Pepino, Arroz), catalog operational matches chronologically latest history.

For **SUSPICIOUS** ingredients (Anchoas, Gema), catalog `current_price` reflects the most recent invoice persist path, but history queries sorted by `created_at` return stale April values.

For **INCORRECT** ingredients:

- **Atum:** Catalog shows May €13.10/kg-equivalent, but `created_at DESC` returns April €3.145 — a 4× understatement if revert logic fires
- **Mozzarella:** Catalog shows €13.69 (2kg block) but chronology-latest is €0.812 (125g ball from suggested match)

## Root cause

`fetchLatestHistoryNewPrice`, `revertIngredientCurrentPriceFromHistory`, and `ingredients.tsx` priceActivity all sort by **`created_at`**, not `resolveInvoiceChronology`.

### Chronology mismatch detail (4/6 ingredients)

May-2026 invoice rows carry `created_at=2023-05-19`, causing:

- `created_at DESC` → picks April 2026 rows as "newest"
- Invoice chronology → correctly picks May 2026 rows

Affected: Arroz, Anchoas, Gema (catalog still correct via direct persist), Atum (revert risk), Mozzarella (compounded by suggested-match poison row).

## Revert path risk

`revertIngredientCurrentPriceFromHistory` uses `fetchLatestHistoryNewPrice` → if triggered on Atum or Mozzarella, would set catalog to wrong operational cost.
