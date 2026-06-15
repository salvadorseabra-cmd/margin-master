# Denominator Trace — 6.29 ÷ 2 = 3.145

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · Phase 4C pre-repair investigation  
**Mode:** Read-only (no code/data changes)

---

## Summary

April Atum invoice line: qty **2** `un`, unit_price **€6.29** (already per 1 kg bag). The pipeline treats `purchase_quantity = 2` and divides again:

```
operationalUnitPriceForPriceHistory(6.29, 2) = 6.29 / 2 = 3.145
```

The divisor **2** comes from `resolveCountablePurchaseQuantityForCost` returning `rowQty` when the invoice row unit is a countable token.

---

## Where `2` comes from

`resolveCountablePurchaseQuantityForCost` returns **`rowQty`** when the invoice row unit is a countable token (`un`, `uni`, etc.):

```445:455:src/lib/invoice-purchase-price-semantics.ts
  if (
    rowUnit === "un" ||
    rowUnit === "uni" ||
    rowUnit === "unid" ||
    rowUnit === "unit" ||
    rowUnit === "units" ||
    rowUnit === "pc" ||
    rowUnit === "pcs"
  ) {
    return rowQty;
  }
```

April Atum: `rowQty = 2`, `unit_price = 6.29` (already per bag — `total/qty = 6.29`).

---

## Why weight-in-name does not rescue Atum

Comment at L422–424 explicitly forbids routing gram weight from product name alone for countable denominator (buns-at-80g fix). Name **1 Kg** is parsed for **stock** (2000 g) but costing stays on countable `un` path:

```510:527:src/lib/invoice-purchase-price-semantics.ts
  if (family === "countable") {
    const purchaseQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
    // ...
    return {
      current_price: unitPrice,
      purchase_quantity: purchaseQty,
      cost_base_unit: "un",
```

`packMeasureCostFieldsFromSingleCountable` only applies when `purchaseQty === 1` and **ml** per-unit — not April qty=2, not kg.

---

## Division into history

```149:159:src/lib/ingredient-price-history.ts
export function operationalUnitPriceForPriceHistory(
  packPrice: number | null | undefined,
  purchaseQuantity: number | null | undefined,
): number | null {
  // ...
  return resolvedOperationalUnitCostEur({
    current_price: pack,
    purchase_quantity: purchaseQuantityDenom(purchaseQuantity),
  });
}
```

`resolvedOperationalUnitCostEur` = `pack / purchaseQuantityDenom(pq)` → `6.29 / 2 = 3.145`.

Stored via `storedPriceHistoryFieldsFromParams` → `appendIngredientPriceHistoryFromInvoiceLine` INSERT.

---

## Root cause statement

When `unit=un` and qty > 1, `resolveCountablePurchaseQuantityForCost` returns `rowQty` unconditionally. If `unit_price` is already per priced unit (`total ≈ qty × unit_price`), this **double-divides** the invoice unit price before it reaches `ingredient_price_history.new_price`.

---

## Verdict

**3.145 is a pipeline artifact**, not an OCR or extraction error. The April row should store **6.29**; May delta should chain from 6.29 → 13.10 (~+108%), not 3.145 → 13.10 (+316%).
