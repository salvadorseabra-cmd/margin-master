# Current Price Validation — Historical Pricing Repair Phase 4A (Mozzarella)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15 (post-repair)

---

## Catalog

| Field | Value | Operational € |
|---|---|---|
| `current_price` | 13.69 | **13.69** |
| `purchase_quantity` | 1 | — |
| `unit` | un | — |

**Unchanged by repair** — was already correct from latest confirmed Aviludo persist.

---

## History alignment

| Source | Operational € | Matches catalog? |
|---|---|---|
| `fetchLatestHistoryNewPrice` (created_at DESC, linked rows) | **13.69** | ✅ |
| Latest history row `3c508a43` | **13.69** | ✅ |
| Latest **confirmed** purchase (Apr Aviludo 2Kg) | **13.69** | ✅ |
| `validate-historical-pricing.mts` `current_price_from_latest_history` | **true** | ✅ |

---

## Before vs after contamination

| Query path | Before | After |
|---|---|---|
| Catalog | 13.69 ✅ | 13.69 ✅ |
| History latest (was poisoned) | 0.812 ❌ | 13.69 ✅ |
| Revert risk (`revertIngredientCurrentPriceFromHistory`) | Would set ~€0.81 ❌ | Would set **€13.69** ✅ |

---

## Confirmed purchase trace

| Invoice | Date | Line | Unit price | Expected op | History row | `op_matches_invoice` |
|---|---|---|---|---|---|---|
| `c2f52357` | 2026-04-17 | Mozzarella Flor di Latte 2Kg | 13.69 | 13.69 | `3c508a43` | **true** |

---

## Verdict

**current_price validation: PASS**

- Catalog €13.69 is economically correct
- History queries now agree with catalog and confirmed purchase
- No revert needed
