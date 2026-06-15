# Countable Audit — VL Post Phase 4C

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Focus:** Every COUNTABLE item — trace line → `purchase_quantity` → operational price → history. Verify no double divide post-4C.

---

## Summary

| Verdict | Confirmed | Unmatched |
|---|---:|---:|
| **VALID** | 11 | 6 |
| **SUSPICIOUS** | 0 | 2 |
| **INCORRECT** | **0** | 0 |

**Key finding:** All 5 former multi-`un` confirmed lines (Atum/Anchoas/Gema blast radius) are **VALID** post-4C. `suspect_double_divide: 0`.

---

## Confirmed multi-`un` lines (former Atum blast radius) — all VALID post-4C

| Invoice | Line | Qty | Unit € | `purchase_qty` | Op € | History `new_price` | Verdict |
|---|---|---:|---|---:|---:|---|---|
| Aviludo Apr | Anchovas 495g | 2 | 9.49 | **1** | 9.49 | 9.49 | **VALID** |
| Aviludo Apr | Gema 1kg | 6 | 10.19 | **1** | 10.19 | 10.19 | **VALID** |
| Aviludo Apr | Atum 1kg | 2 | 6.29 | **1** | 6.29 | 6.29 | **VALID** |
| Aviludo May | Anchovas 495g | 2 | 9.99 | **1** | 9.99 | 9.99 | **VALID** |
| Aviludo May | Gema 1kg | 6 | 10.49 | **1** | 10.49 | 10.49 | **VALID** |

**Mechanism (post-4C):** `resolveCountablePurchaseQuantityForCost` detects `total ≈ qty × unit_price` via `isUnitPricePerPricedUnit` and returns `purchase_qty=1` instead of `rowQty`. No double divide.

---

## Other confirmed countable lines

| Invoice | Line | Qty | Unit € | `purchase_qty` | Op € | History `new_price` | Verdict |
|---|---|---:|---|---:|---:|---|---|
| Aviludo May | Atum 1kg | 1 | 13.10 | 1 | 13.10 | 13.10 | **VALID** |
| Aviludo Apr | Mozzarella 2kg | 1 | 13.69 | 1 | 13.69 | 13.69 | **VALID** |

---

## Unmatched countable lines (pipeline replay only)

| Line | Qty | Pipeline | Verdict | Notes |
|---|---:|---|---|---|
| Bocconcino STRACCIATELLA 24un | 24 | pq=1, op=3.11 | VALID | Per-item price detected |
| Bocconcino RICOTTA 2un | 2 | pq=2, op=3.98 | VALID* | *Unmatched; verify `total` at confirm time |
| Bocconcino MOZZARELLA 10un | 10 | pq=1, op=1.89 | VALID | Per-item price detected |
| Bocconcino ROLO DE CABRA 1un | 1 | pq=1, op=12.50 | VALID | — |
| Mammafiore Peroni 24un | 24 | pq=330ml, op=€0.0032/ml | **SUSPICIOUS** | Volume-cost path; math coherent but unusual |
| Mammafiore Balsamic 5l×2 | 1 | pq=5000ml, op=€0.0031/ml | **SUSPICIOUS** | `packMeasureCostFieldsFromSingleCountable` routes to ml |
| Mammafiore Guanciale 5.996un | 5.996 | pq=1, op=10.83 | VALID | Weight-per-piece × row count |
| Mammafiore Farina/Caputo/Amoruso | 1 | pq=1 | VALID | Single-unit lines |
| Mammafiore Recargo combustíveis | 1 | pq=1 | VALID | Fee line |
| Mammafiore Rulo Di Capra | 1 | pq=1 | VALID | — |
| Mammafiore MOZZA Julienne 10un | 10 | pq=1 | VALID | Per-item price detected |

---

## Validation cross-check

`validate-repair-scope.mts` (live):

- `fix_3_multi_un.confirmed_multi_un_count`: **5** (inventory count, not bug count)
- `suspect_double_divide`: **0 / 5**
- All five lines: `purchase_qty=1`, operational price = unit price

`validate-historical-pricing.mts` (6 core ingredients): all catalog op = latest history op.

---

## Verdict

**Confirmed countable: 0 INCORRECT, 0 SUSPICIOUS.**  
Phase 4C fix eliminated all double-divide bugs on confirmed multi-`un` lines. Two unmatched Mammafiore volume lines flagged SUSPICIOUS for future Review & Create (math OK, heuristic unusual).
