# After State — Historical Pricing Repair Phase 4A (Mozzarella)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15 (post-repair)

**Ingredient:** Mozzarella fior di latte · `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`

---

## Metrics (before → after)

| Metric | Before | After |
|---|---|---|
| History row count | 3 | **1** |
| Duplicate groups (Mozzarella) | 1 (`c2f52357`) | **0** |
| Suggested-match history rows (Mozzarella) | 1 (`18bdb0c5`) | **0** |
| `fetchLatestHistoryNewPrice` | 0.812 ❌ | **13.69** ✅ |
| `latest_history_operational` | 0.812 ❌ | **13.69** ✅ |
| `current_price_from_latest_history` | false ❌ | **true** ✅ |
| Catalog `current_price` | 13.69 | **13.69** (unchanged) |
| `delete_present` (scope script) | true | **false** |
| `keep_present` | true | **true** |

---

## Remaining history (1 row)

| ID | Invoice | Date | Supplier | Match | Op € | Prev | Δ% |
|---|---|---|---|---|---|---|---|
| `3c508a43-68bd-4b69-9205-61ddbbfb26a7` | `c2f52357` | 2026-04-17 | AVILUDO | confirmed | 13.69 | null | — |

Chronological order: single bootstrap point — valid.

---

## Contamination checks

| Check | Result |
|---|---|
| No duplicates on `(invoice_id, ingredient_id)` | ✅ `duplicate_groups: []` globally for Mozzarella |
| No poison in history | ✅ Bocconcino suggested match has **no** history row |
| No orphans (`invoice_id IS NULL`) | ✅ reconcile found 0 |
| Latest history = latest confirmed purchase | ✅ Apr Aviludo 2Kg @ €13.69 |
| Confirmed purchase history link | ✅ `3c508a43` (was incorrectly linked to duplicate `9ee1b793` before) |

---

## Matches (unchanged — expected)

| Item | Invoice | Status |
|---|---|---|
| `2ef47b45` | `c2f52357` | confirmed |
| `ec1932a2` | `f0aa5a08` | suggested (no history row — correct) |

---

## Validation commands run (post-repair)

```bash
npx vite-node scripts/repair-mozzarella-history.mts --execute
npx vite-node scripts/validate-repair-scope.mts
npx vite-node scripts/validate-historical-pricing.mts
```
