# Impact Validation — Historical Pricing Repair Phase 4B

**Queried:** 2026-06-15 · `validate-historical-pricing.mts` + `validate-repair-scope.mts`

---

## Scope script (post-repair)

```json
{
  "found_corrupted": [],
  "global_corrupted_count": 0,
  "total_on_invoice": 8
}
```

Year-mismatch contamination eliminated VL-wide.

---

## Sample ingredient impact

| Ingredient | Catalog op € | Latest history before | Latest history after | `matches_latest` before | `matches_latest` after |
|---|---|---|---|---|---|
| Atum em óleo | 13.10 | 3.145 | **13.10** | ❌ | ✅ |
| Arroz agulha | 1.1625 | 1.1208 | **1.1625** | ❌ | ✅ |
| Anchoas | 4.995 | 4.745 | **4.995** | ❌ | ✅ |
| Gema líquida | 1.7483 | 1.6983 | **1.7483** | ❌ | ✅ |
| Pepino conserva | 3.7483 | 3.7483 | 3.7483 | ✅ | ✅ |
| Mozzarella | 13.69 | 13.69 | 13.69 | ✅ | ✅ |

---

## Surfaces improved (per Phase 3 impact analysis)

| Surface | Impact |
|---|---|
| `fetchLatestHistoryNewPrice` | ✅ All 7 ingredients return May 2026 row |
| `priceActivity` UI | ✅ Correct latest price + chronology |
| History trend chart | ✅ X-axis dates align with invoice year |
| Inflation alerts | ✅ Spike windows include correct May rows |
| `revertIngredientCurrentPriceFromHistory` | ✅ Safer ordering (Atum reverts to 13.10 not 3.145) |

---

## Unchanged / out of scope

| Item | Status |
|---|---|
| `current_price` on all 7 ingredients | Unchanged ✅ |
| Atum `delta_percent` (316% vs ~108%) | Still wrong — Phase 4C denominator |
| Anchoas/Gema operational halving | Still wrong — Phase 4C |
| Mozzarella | Unaffected (Phase 4A complete) |
| Match lifecycle / OCR | Untouched ✅ |

---

## Reconciliation

Not run — not needed. No price fields modified.
