# Risk Assessment — `line_total` Wiring Fix

**Change:** Pass `invoice_items.total` through persist callers so `isUnitPricePerPricedUnit()` can distinguish per-item vs aggregate pricing on multi-`un` lines.

---

## Reference products (VL audit sample)

| Product | Line pattern | Current prod | After fix (expected) | Risk |
|---------|--------------|--------------|----------------------|------|
| **Pepino** | 1 cx @ pack price | pq=6, op €3.665 ✅ | **Unchanged** — cx container path, `isUnitPricePerPricedUnit` not on cx branch | **Low** |
| **Arroz** | 1 cx @ pack price | pq=12, op €1.121 ✅ | **Unchanged** — same cx path | **Low** |
| **Nata** | 5 cx @ €18.89 | Case pricing ✅ | **Unchanged** — `PACK_CONTAINER_UNITS` branch | **Low** |
| **Chocolate** | 2 cx @ €29.99 | Case pricing ✅ | **Unchanged** — cx path uses `resolveUnitsPerPack` | **Low** |
| **Atum** | 2 un @ €6.29, total €12.58 | op €3.145 ❌ | op **€6.29** ✅ | **Intended fix** — regression if `total` null/malformed |
| **Gema** | 6 un @ €10.19, total €61.14 | op €1.698 ❌ | op **€10.19** ✅ | **Intended fix** |
| **Anchoas** | 2 un @ €9.49 | op halved ❌ | op **€9.49** ✅ | **Intended fix** |

---

## Risk categories

### R1 — Low: Pack / case products (Pepino, Arroz, Nata, Chocolate)

**Mechanism:** `resolveCountablePurchaseQuantityForCost` routes `cx`/pack units through `PACK_CONTAINER_UNITS` (L459–462) **before** the `un` + `isUnitPricePerPricedUnit` branch.

**What could break:** Only if `total` is passed incorrectly and accidentally satisfies `qty × unit_price ≈ total` on a case line with `qty > 1` — extremely unlikely for standard cx invoices (total = pack price, not qty × unit_price).

**Mitigation:** Existing tests for brioche 24-pack cx (persistence test L530–558) should remain green.

### R2 — Low: Weight rows (kg, Hortelã)

**Mechanism:** kg branch returns `purchase_quantity: 1000` directly (L523–524). `line_total` unused.

**What could break:** Nothing expected.

### R3 — Low: Single-`un` lines (Atum May qty=1)

**Mechanism:** `isUnitPricePerPricedUnit` returns `false` when `rowQty <= 1` (L185).

**What could break:** Nothing expected.

### R4 — Medium: Aggregate `unit_price` lines (total stored IN unit_price field)

**Mechanism:** When `unit_price` is line aggregate (not per-item), `isUnitPricePerPricedUnit` must return `false` so `purchase_quantity = rowQty` is preserved.

**Evidence:** Test `preserves rowQty when line total is aggregate unit_price` (`invoice-purchase-price-semantics.test.ts` L182–191) — Atum with `unit_price: 12.58, line_total: 12.58, qty: 2` → pq=2.

**What could break:** If OCR stores wrong `total` (e.g. total = unit_price when qty > 1), detection could mis-fire.

**Mitigation:** Tolerance gates (€0.02 abs, 0.5% rel) already in `isUnitPricePerPricedUnit`. Monitor via `validate-repair-scope.mts`.

### R5 — Medium: Missing or null `total` on multi-`un` lines

**Mechanism:** Without `total`, behavior **unchanged** (current bug persists).

**What could break:** Partial wiring — some callers pass `total`, others don't → inconsistent DB state.

**Mitigation:** Wire all callers in scope doc; add integration test covering full chain.

### R6 — Medium: Re-extract refresh overwrites correct repairs

**Mechanism:** Until fix deployed + repair re-run, any re-extract re-poisons data.

**Status:** Known — documented in `REPAIR_REGRESSION_TRACE.md`.

**Post-fix:** Refresh should write **correct** values; May chain deltas should normalize to ~108% for Atum.

### R7 — Low: ml/g single-unit routing (Hellmann's, buns)

**Mechanism:** `packMeasureCostFieldsFromSingleCountable` runs when `purchaseQty === 1` (L493–509).

**What could break:** Only if multi-`un` + `line_total` forces pq=1 on a line that should use ml denominator — unlikely for `qty > 1` bun cases.

### R8 — Low: Operational overlay display

**Mechanism:** `buildLatestOperationalIngredientCostByIngredientIdFromScan` also omits `total`.

**What could break:** UI overlay shows wrong op for multi-`un` until secondary fix applied.

**Severity:** Display only — not history corruption.

### R9 — Low: Opportunity / supplier intelligence deltas

**Mechanism:** Downstream reads `ingredient_price_history.new_price`.

**What could break:** After fix + repair, historical deltas will **change** (e.g. Atum May from +316% → ~+108%). Expected correction, not regression.

---

## Explicit product verdicts

| Product | Safe to fix? | Notes |
|---------|:------------:|-------|
| Pepino | ✅ | cx path isolated |
| Arroz | ✅ | cx path isolated |
| Nata | ✅ | cx path; separate suggested-match blocker unrelated |
| Chocolate | ✅ | cx path |
| Pack products (general) | ✅ | `PACK_CONTAINER_UNITS` precedence |
| Case products (general) | ✅ | `resolveUnitsPerPack` from name/structure |
| Atum / Gema / Anchoas | ✅ (target) | Primary beneficiaries |
| Mozzarella kg | ✅ | weight path |
| Brioche 24x80g cx | ✅ | existing test coverage |

---

## Blast radius summary

| Area | Risk level |
|------|------------|
| cx / pack / case pricing | **Low** |
| kg / L weight pricing | **Low** |
| multi-`un` per-item priced (Atum class) | **Fix target** — currently broken |
| Aggregate unit_price edge cases | **Medium** — guarded by tests |
| Partial deploy / incomplete wiring | **Medium** — process risk |
| Historical delta displays | **Low** — values will change toward correct |

**Overall regression risk for intended fix: Low–Medium**, dominated by OCR `total` quality on edge cases, not by Pepino/Arroz/Nata/Chocolate case paths.
