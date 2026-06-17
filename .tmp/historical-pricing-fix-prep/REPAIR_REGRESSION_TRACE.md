# Repair Regression Trace — Atum Phase 4C → €3.145

**Mode:** Read-only  
**Ingredient:** Atum em óleo (`0f30ccb3-bb47-40bb-83cc-ae2a4018066d`)  
**April invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472`  
**History row:** `781ab1ac-39d2-4462-9106-635e5603c466`

---

## Timeline

| When | Event | Atum April `new_price` | Catalog `purchase_quantity` |
|------|-------|------------------------|----------------------------|
| Pre-repair | Original persist (no `line_total`) | **€3.145** | 2 |
| 2026-06-14 / Phase 4C | `repair-multi-un-history.mts --execute` | **€6.29** ✅ | 1 |
| 2026-06-16 ~17:13Z | Catalog batch re-sync (38 ingredients) | **€3.145** ❌ reverted | **2** ❌ |
| Post-validation | `validate-historical-pricing.mts` | 7/13 sample contaminated | — |

**No new history INSERTs** after Phase 4C — regression is via **UPDATE** (refresh path), not new rows.

---

## Phase 4C repair mechanism (what was fixed)

Script: `scripts/repair-multi-un-history.mts`

- Recomputes `operationalCostFieldsFromInvoiceLine` **with `total`** from `invoice_items`
- `isUnitPricePerPricedUnit(2, 6.29, 12.58)` → `purchase_quantity = 1`
- Updates `ingredient_price_history.new_price` → **6.29**
- Updates `ingredients.current_price` / `purchase_quantity`

Repair touched **data only** — production callers unchanged.

---

## Exact overwrite write path (2026-06-16)

```
User action: re-extract OR upload-triggered re-sync on Aviludo-linked invoice batch
  (38 ingredients updated 2026-06-16T17:13Z per forward-persistence-validation)

src/routes/invoices.tsx
  runExtraction(invoiceId, dataUrl)                    [L1344]
    → invoice_items deleted + re-inserted (total in DB ✅)  [L1435–1466]
    → syncOperationalIngredientCostsFromInvoiceLines     [L1486]
        items WITHOUT total                                [L1490–1495]

src/lib/ingredient-operational-intelligence.ts
  syncOperationalIngredientCostsFromInvoiceLines         [L952]
    → persistOperationalIngredientCostFromInvoiceLine    [L996]
        operationalCostFieldsFromInvoiceLine (no total)  [L113]
          → resolveCountablePurchaseQuantityForCost
          → isUnitPricePerPricedUnit: FALSE (line_total missing)
          → purchase_quantity = 2 (rowQty)

src/lib/ingredient-auto-persist.ts
  persistOperationalIngredientCostFromInvoiceLine        [L101]
    → ingredients.update({ current_price: 6.29, purchase_quantity: 2 })  [L126–132]
    → appendIngredientPriceHistoryFromInvoiceLine        [L142]

src/lib/ingredient-price-history.ts
  appendIngredientPriceHistoryFromInvoiceLine            [L458]
    → fetchHistoryRowForInvoiceIngredient → existing row found
    → refreshExisting = true                             [L473–474]
    → storedNew = operationalUnitPriceForPriceHistory(6.29, 2)
                = 6.29 / 2 = 3.145                       [L477–478]
    → ingredient_price_history UPDATE                    [L531–543]
        new_price: 3.145  ← overwrites Phase 4C repair
    → reconcileIngredientPriceHistoryChain               [L550–553]
        May row delta_percent → +316.5% (wrong prior)
```

---

## Why refresh overwrites instead of skipping

`appendIngredientPriceHistoryFromInvoiceLine` refresh logic (L525–527):

- Skips only when `priceHistoryRowValuesMatch(existingRow, storedPrev, storedNew)`
- Contaminated recompute **≠** repaired values → UPDATE proceeds
- `created_at` preserved on refresh (L529–543) — ordering unchanged, **values corrupted**

---

## Catalog regression (same event)

`ingredients.update` in `persistOperationalIngredientCostFromInvoiceLine` (L126–132) writes:

- `current_price: 6.29` (pack price from invoice — correct raw value)
- `purchase_quantity: 2` (wrong denominator)

Display/recipe costing uses `current_price / purchase_quantity` → **€3.145** operational.

---

## Regression triggers (any of these re-poisons data)

| Trigger | Path | Risk |
|---------|------|------|
| Re-extract on Aviludo April/May invoices | Path 2 | **Proven** — 9 rows re-synced 2026-06-16 |
| New upload with matched multi-`un` lines | Path 1 | High |
| Match confirm on multi-`un` line | Path 3 | High |
| Re-run `backfillIngredientPriceHistoryFromInvoices` | D2 | Medium (script) |

---

## Root cause of regression (not separate bug)

Same Scenario B gap: **library fix deployed, production callers still omit `total`**.

Phase 4C repaired historical rows in DB; the next live persist through the dirty path **recomputed and overwrote** them via the refresh branch.

---

## Required post-fix actions (implementation scope, not executed here)

1. Wire `total` through all persist callers (see `IMPLEMENTATION_SCOPE.md`)
2. Re-run `repair-multi-un-history.mts --execute` (or equivalent) after deploy
3. Validate with `validate-historical-pricing.mts` + `validate-repair-scope.mts`
