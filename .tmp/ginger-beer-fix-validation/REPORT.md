# Ginger Beer Fix Verification

**Invoice:** Emporio Italia `17aa3591-ec98-4c21-89c9-5ae946bc97bb`  
**Fix:** commit 9d21b8a — `repairDecimalClBeverageVolume()` via `detectVolume()` when beverage + decimal CL + volume < 50ml  
**Generated:** 2026-06-10T20:01:27.010Z

## Live DB row (queried 2026-06-10)

| Field | Value |
|-------|-------|
| id | `0dbbc281-9384-493f-9f92-68786058a5b5` |
| name | `Baladin - Ginger Beer 0.20cl` |
| qty | 2 |
| unit | cx |
| unit_price | €9.69 |
| total | €19.38 |
| ingredient link | none in schema (no `ingredient_id` on `invoice_items`) |
| matched ingredients | 0 ginger/baladin rows |
| matched aliases | 0 ginger/baladin aliases |

> **Note:** Prior audit used qty=24 unit=un @ €0.85. Live row is now **2 cx @ €9.69** (same line total €19.38).

---

## BEFORE (pre-fix baseline from audits — 24 un @ €0.85)

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | 2 ml |
| Usable qty (total ml) | 48 ml |
| €/L usable | €425.00 |
| repair executed | YES |
| repair decision | warning-only |
| UI normalized line | 48 ml usable |
| UI usable cost line | €425.00 / L usable |

---

## AFTER (current live row — 2 cx @ €9.69)

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | 2 ml |
| Usable qty — costing path (total ml) | 4 ml |
| Usable qty — display path | null (suppressed) |
| €/L usable (display structured) | n/a |
| €/case (if case-piece-weight path) | €9.69 |
| `repairDecimalClBeverageVolume` executed? | **YES** |
| repair decision | **warning-only** |
| `isCaseRowWithEmbeddedPieceWeightOnly` | true |
| UI normalized line | — |
| UI usable cost line | €9.69 / case usable |

---

## AFTER (simulated — SKU in name: `BBB-GINGER33ITA Baladin - Ginger Beer 0.20cl`)

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | 330 ml |
| Usable qty (total ml) | 660 ml |
| €/L usable | n/a |
| repair executed (inside `detectVolume` @ 2ml) | **YES → repaired** |
| repair decision | **repaired** (`sku-clue-GINGER33`) |
| €/L usable (24 un shape) | **€2.58/L**, 7920 ml total |

---

## Did the real bug disappear?

**NO** — for the stored DB name `Baladin - Ginger Beer 0.20cl` (no product code).

- `detectVolume` still parses **0.20cl → 2 ml/unit** (repair does not change output without SKU clue).
- `repairDecimalClBeverageVolume` **runs** (console warning) but returns **warning-only** (`decimal-cl-beverage-anomaly`), not repaired.
- With **GINGER33** in the name, repair **does** fire → **330 ml/unit** and ~**€2.58/L** (24 un scenario) or proportional totals for cx row.

### UI display for current live row

The invoice UI uses `resolveInvoiceLinePricingPresentation` → `resolveStructuredPurchaseForDisplay`, which **suppresses** ml totals for `cx` rows where the name embeds only per-piece volume (`isCaseRowWithEmbeddedPieceWeightOnly`). So the UI **does not** show 48 ml / €425/L on the current **2 cx** row — it shows **€/case** pricing instead.

For the historical **24 un** shape (still useful as bug baseline), the UI **would still show ~48 ml total and ~€425/L usable** because countable `un` rows are not suppressed.

---

## Evidence files

- `.tmp/ginger-beer-fix-validation/db-query.json`
- `.tmp/ginger-beer-fix-validation/trace-results.json`
- `.tmp/ginger-beer-fix-validation/REPORT.md`
