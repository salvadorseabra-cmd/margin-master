# Root Cause Fix — Phase 4C

**Checkpoint:** `602c768`  
**Date:** 2026-06-15

## Problem

`resolveCountablePurchaseQuantityForCost` returned `rowQty` for all multi-`un` invoice lines. When `unit_price` is already per priced unit (bag/tin/pack) and `total ≈ qty × unit_price`, dividing again in `operationalUnitPriceForPriceHistory` halved (or ÷qty) the stored operational price.

Example: Atum 2 × €6.29 → stored **3.145** instead of **6.29**.

## Fix

Added `isUnitPricePerPricedUnit()` in `src/lib/invoice-purchase-price-semantics.ts`:

- When `unit=un` (countable tokens) and `qty > 1`
- If `line_total ≈ qty × unit_price` (abs ≤ €0.02 or rel ≤ 0.5%)
- Return **1** (denominator per priced unit), not `rowQty`

Wired `total` → `line_total` through `operationalCostFieldsFromInvoiceLine` so validation/repair scripts and future persist paths can pass invoice line totals.

## Tests added

- Atum 2 × €6.29 / €12.58 → op **6.29**
- Anchoas 2 × €9.49 → op **9.49**
- Gema 6 × €10.19 → op **10.19**
- Aggregate unit_price (total in unit_price field) → preserves `rowQty`

## Preserved paths

- `cx`/pack container units (Pepino, Arroz, Coca-Cola case)
- kg/L weight rows
- Single-`un` buns (80g), Hellmann's ml routing
- BAC STRK multi-kg canonical match
