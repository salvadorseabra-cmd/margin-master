# San Pellegrino Quantity-Loss Root Cause Audit

**Generated:** 2026-06-23  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes

---

## Executive Summary

The second case is lost at **stock-normalization** (classification **C**). Extraction correctly records **2 cases** and **€38.56** line total. `SIZE_COUNT_RE` parses one case as **15 × 75 cl = 11 250 ml (11.25 L)**. `structureTotalIsFinalForGenericRow` treats that structure total as final for generic `un` rows and **does not multiply by invoice outer qty = 2**. Downstream purchase-format, persistence, and UI faithfully propagate **11.25 L**, producing **€3.43/L** instead of commercial **€1.71/L** (22.5 L).

**Note on user scenario:** Product name `ACQUA S.PELLEGRINO (CX 75CL*15)` is the Bocconcino line; **€38.56** and **€3.43/L** match the Emporio line `SanPellegrino - Acqua in vitro 75cl x 15ud`. Both lines share the identical normalization defect.

**Verdict: READY** — evidence complete for fix implementation.

---

## 1. Full Lifecycle Trace

### Emporio (matches €38.56 / €3.43/L) — `9cdd22ba-051b-4422-a122-3e6a39e9ef8c`

| Stage | Value | Unit | Notes |
|-------|------:|------|-------|
| **Invoice extraction** | qty **2**, unit `un`, unit_price **19.28**, total **38.56** | cases / € | VL `invoice_items` live 2026-06-23 |
| **Monetary binding** | unchanged | — | `bindMonetaryColumns` — no qty change |
| **Purchase format** | kind `multi_unit_pack`, purchaseContainerCount **15**, normalizedUsableQuantity **11250** | ml | From structure; 15 bottles/case |
| **Stock normalization** | tier `size_count`, token `75cl x 15ud`, usableSource `structure_total`, usableQuantity **11250** | ml | **Loss here:** outer qty 2 not applied |
| **Ingredient persistence** | current_price **19.28**, purchase_quantity **11250**, cost_base_unit `ml` | € / ml | `recipeOperationalCostFieldsFromInvoiceLine` |
| **Purchase history / detail** | Last **2 un**, Proc **€19.28/case**, Op **€3.43/L**, Usable **11.25 L** | — | `resolveInvoiceLinePricingPresentation` |

### Bocconcino — `ef25be0f-f153-40de-b377-25151d147637`

| Stage | Value | Unit | Notes |
|-------|------:|------|-------|
| **Invoice extraction** | qty **2**, unit `un`, unit_price **20.97**, total **42.07** | cases / € | Same qty pattern |
| **Stock normalization** | token `75CL*15`, usableQuantity **11250** | ml | Same defect; Op **€3.73/L** |
| **UI** | Usable **11.25 L** | L | Expected 22.5 L for 2 cases |

VL `ingredients` / `invoice_item_matches`: **no persisted ingredient rows** for Pellegrino at audit time (40 ingredients in VL; none matched). UI economics are computed at read time from `invoice_items` via `ingredient-purchase-memory.ts` → `resolveInvoiceLinePricingPresentation`.

---

## 2. Quantity Fields (Pellegrino Emporio line)

| Field | Value | Correct for 2 cases? |
|-------|------:|:--------------------:|
| invoice quantity | **2** | ✓ |
| purchaseQuantity (recipe/catalog countable) | **1** (via `resolveCountablePurchaseQuantityForCost`) | ✗ (should reflect 2 priced outers for case economics) |
| purchaseUnit | `un` | ✓ |
| purchaseContainerCount (structured inner) | **15** | ✓ (bottles per case) |
| normalizedUsableQuantity | **11250** ml | ✗ (should be **22500** ml) |
| operationalQuantity (`recipeFields.purchase_quantity`) | **11250** ml | ✗ |
| current_price inputs | `{ current_price: 19.28, purchase_quantity: 11250, cost_base_unit: "ml" }` | ✗ denominator |
| usablePerPricedUnit | `{ amount: 11250, unit: "ml" }` line total | ✗ |

---

## 3. First Incorrect Stage

| Stage | Correct? | Value |
|-------|:--------:|-------|
| A) Extraction | **Yes** | qty=2, total=€38.56 |
| B) Purchase-format | **Yes** (given upstream) | multi_unit_pack, 11250 ml passed through |
| C) Stock-normalization | **No** | 11250 ml (1 case) not 22500 ml (2 cases) |
| D) Ingredient persistence | **No** | propagates 11250 ml |
| E) Ingredient detail query | **No** | recomputes same semantics from invoice line |
| F) UI representation only | **No** | displays 11.25 L / €3.43/L faithfully |

**First incorrect stage: C) stock-normalization**

---

## 4. Issue Classification

**C) stock-normalization** (exactly one primary class)

Mechanism in `src/lib/stock-normalization.ts`:

1. `parsePurchaseStructureFromText` → `SIZE_COUNT_RE` matches `75CL*15` / `75cl x 15ud` → tier `size_count`, `purchaseQuantity=1`, `totalUsableAmount=11250` ml.
2. `resolveStructurePurchaseQuantity` → returns **1** because `structureTotalIsFinalForGenericRow(structure, 'un')` is **true** (`innerUnitCount=15 > 1`).
3. `shouldScaleOuterPackForSizeCountGenericRow` → **false** (`unitMeasurement === 'cl'`, not `'g'`).
4. `computeUsableFromPurchaseStructure` → `structure_total` branch, fallback: *"name N×SIZE total is final; generic row does not rescale inner pack"*.

`CAIXA_UNITS_SIZE_RE` does **not** match `(CX 75CL*15)` — pattern expects inner count before size (`.tmp/mozzarella-vs-pellegrino-separation/`).

---

## 5. Mathematical Explanation — Why UI Shows €3.43/L

**Inputs (Emporio):**

- Line total paid: **€38.56**
- Unit price: **€19.28/case**
- System usable: **11 250 ml = 11.25 L** (one case only)

**Operational cost path** (`computeEffectiveUsableCost`):

1. `resolveUsablePerPricedUnit` → **11 250 ml** (line-level; single-unit re-parse with qty=1 yields same 11 250 ml).
2. `resolveOperationalUsablePerPricedUnit` → **11 250 / 2 = 5 625 ml** per priced case (per-case split because structure total did not scale with row qty).
3. **€19.28 ÷ (5 625 / 1000) = €19.28 ÷ 5.625 L = €3.4276/L → displayed €3.43/L**

**Cross-check from line total:**

- **€38.56 ÷ 11.25 L = €3.4276/L** — same figure; implied liters = **11.25 L** (half of commercial 22.5 L).

**Commercial expectation:**

- 2 × (15 × 0.75 L) = **22.5 L**
- **€38.56 ÷ 22.5 L = €1.714/L ≈ €1.71/L**

The UI math is **internally consistent** with the wrong usable denominator; the error is **11.25 L stored instead of 22.5 L**.

---

## 6. Comparison Products

| Product | Invoice qty | Parser tier | Usable (system) | Usable (commercial) | Op cost OK? | Same bug? |
|---------|------------:|-------------|----------------:|--------------------:|:-----------:|:---------:|
| **S.Pellegrino** (Boc + Emp) | **2** cases | SIZE_COUNT_RE `75CL*15` | **11.25 L** | **22.5 L** | No (€3.73 / €3.43 per L) | **Yes** |
| **Peroni 33cl×24** | **24** bottles | SIZE_COUNT_RE `33cl*24` | **7.92 L** | **7.92 L** | Yes (€3.24/L) | **No** — `rowQty === innerCount` |
| **Pomodori 2.5kg×6** | **1** case | SIZE_COUNT_RE `2,5KG*6` | **15 kg** | **15 kg** | Yes (€1.47/kg) | **No** — `qty=1` |
| **Açúcar 10×1kg** | **1** cx | count_size `10x1Kg` | **10 kg** | **10 kg** | Yes (€0.93/kg) | **No** — count_size + qty=1 |

### Scope classification

**quantity>1 outer-pack family within SIZE_COUNT_RE** when `rowQty ≠ innerUnitCount` and generic row unit.

- **Not Pellegrino-only** — Mozzarella (`125GR*8`, qty=10, g) and Mezzi paccheri (`1KG*6`, qty=2, kg) share the same `structureTotalIsFinalForGenericRow` gate (Mozzarella under-counts g; Pellegrino under-counts cl volume).
- **Not entire size_count family** — Peroni, Pomodori, Rulo, Aceto are correct under current policy.
- **Not broad operational-cost family** — Açúcar uses `count_size`; unaffected.

Prior audit `.tmp/quantity-mismatch-ui-audit/` classified Pellegrino as **C (operationally correct)** because €/case procurement aligned; **usable denominator was not validated against multi-case commercial volume**. This audit corrects that: **user-visible usable/cost error when qty>1 cases**.

---

## Evidence Sources

| Source | Finding |
|--------|---------|
| VL DB read-only `invoice_items` | Pellegrino qty=2, totals €42.07 (Boc) / €38.56 (Emp) |
| Production replay `.tmp/pellegrino-root-cause-audit/replay.mts` | Full pipeline trace → `results.json` |
| `.tmp/mozzarella-vs-pellegrino-separation/` | Shared path; g vs cl discriminator for proposed helper |
| `.tmp/stock-normalization-population-audit/` | SIZE_COUNT_RE population; Pellegrino 11.25 L |
| `.tmp/mozzarella-regression-matrix/` | Option A g-only scaling **regresses** Pellegrino if applied to cl |
| `src/lib/stock-normalization.ts` L1092–1123, L1337–1348 | `structureTotalIsFinalForGenericRow`, `shouldScaleOuterPackForSizeCountGenericRow` |

---

## Final Verdict

| Criterion | Status |
|-----------|--------|
| Extraction qty/total proven | ✓ |
| First incorrect stage identified | ✓ (stock-normalization) |
| Exact code branch named | ✓ |
| €3.43/L formula derived | ✓ |
| Comparison scope bounded | ✓ |
| **READY for fix implementation** | **READY** |
