# Atum Denominator Bug — Root Cause — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

**Ingredient:** Atum em óleo · `0f30ccb3-bb47-40bb-83cc-ae2a4018066d`  
**Catalog:** `current_price=13.10`, `purchase_quantity=1` → operational **€13.10** ✅ (correct today)

---

## The 6.29÷2=3.145 path

**Line:** `ff2ad683` · Atum Óleo Bolsa Nau Catrineta **1 Kg** · qty **2** `un` · unit_price **€6.29** · total €12.58  
**History:** `61c51696-acd8-4a58-878f-a588c1878af0` · stored `new_price=3.145`

```
invoice line (unit=un, qty=2, unit_price=6.29)
  → operationalCostFieldsFromInvoiceLine()
    → recipeOperationalCostFieldsFromInvoiceLine()
      → inferUnitFamily() → "countable"
      → resolveCountablePurchaseQuantityForCost() → returns rowQty = 2
        (name "1 Kg" NOT routed to weight/g — comment at L423-424 forbids gram-from-name alone)
      → purchase_quantity = 2, cost_base_unit = "un"
  → operationalUnitPriceForPriceHistory(6.29, 2) = 6.29 / 2 = 3.145
  → appendIngredientPriceHistoryFromInvoiceLine() stores new_price = 3.145
```

Root cause in `resolveCountablePurchaseQuantityForCost`:

```445:455:src/lib/invoice-purchase-price-semantics.ts
  if (
    rowUnit === "un" ||
    rowUnit === "uni" ||
    ...
  ) {
    return rowQty;  // ← divides unit_price again when it's already per bag
  }
```

**True economics:** `unit_price=€6.29` is per 1 kg bag; `qty=2` means 2 bags. Correct op = **€6.29/kg**, not €3.145.

---

## May chain (`781ab1ac`)

| Field | Value |
|---|---|
| `previous_price` | 3.145 (from April row) |
| `new_price` | 13.10 (qty=1, correct for single bag) |
| `delta_percent` | +316.5% — arithmetic exact, economically wrong |
| True kg move | `(13.10−6.29)/6.29 = +108%` |
| Chain guard | Allows: ratio 4.16× < `RATIO_HARD_CEILING` (14); both classified countable `un` |
| `created_at` | `2023-05-19` (see CREATED_AT_REPAIR_PLAN.md) |

---

## All VL multi-`un` confirmed lines (live audit)

| Ingredient | Invoice | Item | Qty | unit_price | Stored op | True per-item | `suspect_double_divide` |
|---|---|---|---|---|---|---|---|
| Anchoas | `c2f52357` Apr | Anchovas 495g | 2 | 9.49 | 4.745 | 9.49 | ✅ |
| Anchoas | `3b4cb21f` May | Anchoas 495g | 2 | 9.99 | 4.995 | 9.99 | ✅ |
| Gema líquida | `c2f52357` Apr | Ovo Gema 1kg | 6 | 10.19 | 1.698 | 10.19 | ✅ |
| Gema líquida | `3b4cb21f` May | Ovo Gema 1kg | 6 | 10.49 | 1.748 | 10.49 | ✅ |
| **Atum em óleo** | `c2f52357` Apr | Atum 1 Kg | **2** | **6.29** | **3.145** | **6.29** | ✅ |

**Not affected:** Pepino/Arroz use `cx` + pack semantics (`6×720g`, `12×1kg`) — `resolveUnitsPerPack` returns inner count, not row qty.

---

## Code fix required (before data repair)

`resolveCountablePurchaseQuantityForCost` must not use `rowQty` when `unit_price` is per priced unit (detect via `total ≈ qty × unit_price`); route weight-in-name (`1 Kg`) through `g` denominator.

---

## Repair SQL scope (document only — requires code fix first — DO NOT EXECUTE)

```sql
-- ATUM APRIL ROW — correct denominator
UPDATE ingredient_price_history
SET new_price = 6.29,
    previous_price = NULL,
    delta = NULL,
    delta_percent = NULL
WHERE id = '61c51696-acd8-4a58-878f-a588c1878af0';

-- ATUM MAY ROW — rechain after April fix (+ created_at fix from Task 1)
UPDATE ingredient_price_history
SET previous_price = 6.29,
    delta = 6.81,
    delta_percent = 108.26875834650238
WHERE id = '781ab1ac-39d2-4462-9106-635e5603c466';
-- Prefer: reconcileIngredientPriceHistoryChain(client, '0f30ccb3-bb47-40bb-83cc-ae2a4018066d')
```

Anchoas and Gema líquida April/May rows require the same denominator correction (see IMPACT_ANALYSIS.md).
