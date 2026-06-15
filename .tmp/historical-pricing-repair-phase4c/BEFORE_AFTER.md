# Before / After — Phase 4C

**Backup:** `scripts/backups/multi-un-phase4c-pre-update-2026-06-14T23-44-45.json`

## History rows

| Row | Field | Before | After |
|---|---|---|---|
| `61c51696` Atum Apr | `new_price` | 3.145 | **6.29** |
| `781ab1ac` Atum May | `previous_price` | 3.145 | **6.29** |
| `781ab1ac` Atum May | `delta_percent` | +316.53% | **+108.27%** |
| `781ab1ac` Atum May | `new_price` | 13.10 | 13.10 (unchanged) |
| `952119dc` Anchoas Apr | `new_price` | 4.745 | **9.49** |
| `908de185` Anchoas May | `new_price` | 4.995 | **9.99** |
| `e967f673` Gema Apr | `new_price` | 1.698 | **10.19** |
| `e143080d` Gema May | `new_price` | 1.748 | **10.49** |

## Catalog

| Ingredient | Field | Before | After |
|---|---|---|---|
| Atum | `purchase_quantity` / op | 1 / 13.10 | 1 / 13.10 |
| Anchoas | `purchase_quantity` / op | 2 / 4.995 | **1 / 9.99** |
| Gema líquida | `purchase_quantity` / op | 6 / 1.748 | **1 / 10.49** |

## Validation metrics (post-repair)

| Check | Result |
|---|---|
| Atum Apr `new_price` | 6.29 ✅ |
| Atum May Δ% | 108.27% ✅ |
| All 5 multi-`un` lines `suspect_double_divide` | **false** ✅ |
| All 5 lines `op_matches_invoice` | **true** ✅ |
| Anchoas/Gema catalog = latest history | **true** ✅ |
