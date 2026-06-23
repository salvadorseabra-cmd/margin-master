# Mozzarella — Implementation Preparation (READ-ONLY)

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes proposed  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Confirmed failure:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8

**Confirmed facts (evidence-backed):**
- Stages 1–7 correct through persistence (qty=10, unit_price=8.12, total=81.23)
- First incorrect at stock normalization: usable **1 kg** not **10 kg**; operational cost ~10× inflated
- Same subsystem as Guanciale (`SIZE_COUNT_RE` + `structureTotalIsFinalForGenericRow`) but **different root cause** and **opposite direction**
- Pattern expansion: **1 user-visible product** in VL; 5 structural matches excluded (UI correct or different mechanism)

---

## Task 1 — Implementation Target

### Pipeline trace: Invoice Item → Purchase Structure → Stock Normalization → Usable → Operational Cost

```
invoice_items (persisted)
│  qty=10, unit=un, unit_price=8.12, total=81.23
│  name: MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8
│
└─ syncOperationalIngredientCostsFromInvoiceLines / ingredient detail replay
       │
       └─ resolveInvoiceLinePurchaseFormat()          invoice-purchase-format.ts:655
              │
              ├─ parsePurchaseStructureFromText(name)    stock-normalization.ts:632
              │     └─ SIZE_COUNT_RE match "125GR*8"
              │           tier: size_count
              │           innerUnitCount: 8, unitSize: 125 g
              │           totalUsableAmount: 1000 g  (single-pack only)
              │
              ├─ normalizePurchasedToUsableStock()     stock-normalization.ts:1776
              │     └─ computeUsableFromPurchaseStructure()  stock-normalization.ts:1224
              │           ├─ resolveStructurePurchaseQuantity() → 1  (row qty blocked)
              │           ├─ structureTotalIsFinalForGenericRow() → true
              │           └─ usableQuantity: 1000 g, usableSource: structure_total
              │
              └─ structuredFromExplicitPhrase() → StructuredPurchaseFormat
                    kind: multi_unit_pack
                    purchaseContainerCount: 8
                    normalizedUsableQuantity: 1000 g

       └─ recipeOperationalCostFieldsFromInvoiceLine()   invoice-purchase-price-semantics.ts:657
              ├─ resolveCountablePurchaseQuantityForCost() → 1
              ├─ resolveUsablePerPricedUnit() → 1000 g (line total treated as per-unit)
              ├─ resolveOperationalUsablePerPricedUnit() → 100 g (totalUsable ÷ rowQty)
              └─ computeEffectiveUsableCost() → €81.20/kg
```

### Earliest point usable becomes 1 kg (not 10 kg)

| File | Function | Lines | Responsibility |
|------|----------|------:|----------------|
| `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` | 720–738 | Matches `125GR*8` via `SIZE_COUNT_RE`; `buildInnerUnitsStructure` sets `purchaseQuantity=1`, `totalUsableAmount=1000` g |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` | 442–460 | Forces `purchaseQuantity: 1` for inner-units tiers including `size_count` |
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` | 1087–1100 | Returns `true` for `size_count` with inner count > 1 + generic row unit (`un`) |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` | 1139–1155 | With `structureTotalIsFinalForGenericRow` true → returns `1`, ignoring `rowQuantity=10` |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` | 1278–1288 | **First assignment of wrong usable:** `total = structure.totalUsableAmount` (1000 g); fallback `"name N×SIZE total is final; generic row does not rescale inner pack"` |

**Earliest incorrect transformation:** `computeUsableFromPurchaseStructure` at the `structureTotalIsFinalForGenericRow` branch — structure parse (`1000` g) is semantically correct for **one outer pack** but invoice `qty=10` is not applied.

**Orchestration entry (not earliest bug):** `resolveInvoiceLinePurchaseFormat` (`invoice-purchase-format.ts:655`) calls the above; first wrong **persisted/displayed** usable appears in its structured output block.

**Downstream amplification (not root cause):** `resolveOperationalUsablePerPricedUnit` (`invoice-purchase-price-semantics.ts:476`) divides `totalUsable / rowQuantity` when single-pack replay equals line total → 100 g per priced unit → `computeEffectiveUsableCost` yields €81.20/kg.

---

## Task 2 — Value Trace

**Product:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8  
**Invoice item:** `095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6`  
**Ingredient:** Mozzarella fior di latte (`2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`)

| Stage | Quantity | Package Structure | Usable Quantity | Correct? |
|-------|----------|-------------------|----------------:|----------|
| 1. PDF reality | 10 packs | 125GR×8 = 1 kg/pack | **10 000 g (10 kg)** | ✓ |
| 2. OCR / GPT raw (Pass C) | 10 | (in name) | — | ✓ |
| 3. Pass C baseline | 10 | — | — | ✓ |
| 4. Hybrid H (v25) | 10 | — | — | ✓ |
| 5. bindMonetaryColumns | 10 | — | — | ✓ |
| 6. reconcileLineItemAmounts | 10 | — | — | ✓ |
| 7. invoice_items persisted | 10 | — | — | ✓ |
| 8a. `parsePurchaseStructureFromText` | — | tier `size_count`, inner=8, size=125 g, matched `125GR*8` | **1 000 g** (1×8×125) | ✗ first wrong value |
| 8b. `computeUsableFromPurchaseStructure` | row qty 10, unit `un` | `purchaseContainerCount=1` | **1 000 g** (`structure_total`) | ✗ |
| 8c. `resolveInvoiceLinePurchaseFormat` | 10 | `multi_unit_pack`, `purchaseContainerCount=8` | **1 000 g** | ✗ |
| 9. Ingredient detail UI | Last 10 un | 8 × 125 g | **1 kg usable** | ✗ |
| 10. Procurement cost | purchaseQtyForCost=1 | €8.12/unit | — | ✓ (per-pack price correct) |
| 11. Operational cost | — | €81.23 ÷ 1 kg | **€81.20/kg** | ✗ (should €8.12/kg) |

### First incorrect transformation (detailed)

```
Input:  name="…125GR*8", rowQuantity=10, rowUnit="un"

parsePurchaseStructureFromText:
  SIZE_COUNT_RE → innerUnitCount=8, unitSize=125, unitMeasurement=g
  buildInnerUnitsStructure → purchaseQuantity=1, totalUsableAmount=1000

structureTotalIsFinalForGenericRow(structure, "un") → true
  (hasInner=true, tier=size_count, generic row unit)

resolveStructurePurchaseQuantity → 1  (invoice qty 10 blocked)

computeUsableFromPurchaseStructure → usableQuantity=1000, usableSource=structure_total

Expected at this stage: 1000 × 10 = 10000 g
  OR structure_total=1000 g per pack × outer row qty 10
```

**Control on same invoice:** STRACCIATELLA 250 GR, qty=24 → `bare_measure` tier → **6 000 g** (correct). Proves pipeline can scale by row qty when `structureTotalIsFinalForGenericRow` does not block.

**Sources:** `.tmp/phase1-validation-forensics-result.json` (`additional.mozzarella fior`), `.tmp/quantity-mismatch-ui-audit/replay.json`, `.tmp/stock-normalization-family-assessment/assessment.json`

---

## Task 3 — Change Surface

*If fixed at earliest incorrect stage (`computeUsableFromPurchaseStructure` / `structureTotalIsFinalForGenericRow` policy for `size_count` + outer-pack semantics). No fix proposed here — surface mapping only.*

### Direct impact

| File | Change locus | Impact |
|------|--------------|--------|
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` (1087–1100) | Policy gate — currently treats `size_count` inner totals as final for generic `un` rows |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` (1126–1200) | Outer purchase count resolution — returns `1` when final-policy triggers |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` (1254–1294) | Usable assignment — `structure_total` vs `structure_scaled_outer` branch |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` (442–460) | Sets `purchaseQuantity: 1` for all inner-unit tiers |
| `src/lib/stock-normalization.test.ts` | SIZE×COUNT + outer qty cases | Regression harness for Mozzarella + structural controls |

### Indirect impact (downstream of corrected usable)

| File | Function | Impact |
|------|----------|--------|
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat`, `structuredPurchaseToIngredientFields` | `normalizedUsableQuantity`, `purchaseContainerCount` propagate to catalog |
| `src/lib/invoice-purchase-price-semantics.ts` | `resolveUsablePerPricedUnit`, `resolveOperationalUsablePerPricedUnit`, `computeEffectiveUsableCost` | Op €/kg recomputes from corrected usable (81.20 → 8.12) |
| `src/lib/invoice-purchase-price-semantics.ts` | `resolveCountablePurchaseQuantityForCost`, `recipeOperationalCostFieldsFromInvoiceLine` | `usable_weight_grams` overlay changes |
| `src/lib/ingredient-auto-persist.ts` | `syncOperationalIngredientCostsFromInvoiceLines` | Re-ingest updates `ingredients.current_price`, `purchase_quantity`, usable fields |
| `src/lib/ingredient-price-history.ts` | `operationalUnitPriceForPriceHistory` | History `new_price` may shift on re-ingest |
| `src/routes/invoices.tsx` | `runExtraction` / re-sync paths | Re-ingest of `f0aa5a08` required to correct persisted economics |

### Explicitly out of scope for this bug

| File | Reason |
|------|--------|
| `supabase/functions/extract-invoice/*` | Extraction stages 1–7 proven correct; qty=10 not mutated |
| `src/lib/ingredient-unit-inference.ts` | Volume/weight inference not on critical path for this line |
| Guanciale-specific weight-semantics | Different mechanism (over-count); shared code but divergent fix |

### Guanciale coupling warning

Both bugs touch `structureTotalIsFinalForGenericRow` and `SIZE_COUNT_RE`. A naive blanket change to always scale by row qty risks **regressing Guanciale controls** or **structural-only matches** (Peroni, S.Pellegrino) where UI economics are already correct per `.tmp/quantity-mismatch-ui-audit/`.

---

## Task 4 — Regression Population

**Scan scope:** All 51 VL `invoice_items` (7 invoices) through `SIZE_COUNT_RE` → `parsePurchaseStructureFromText` → `computeUsableFromPurchaseStructure` → `structureTotalIsFinalForGenericRow`.

**Method:** `.tmp/bug-pattern-expansion-audit/audit.mts` live replay + `.tmp/quantity-mismatch-ui-audit/` UI corroboration.

| Product | Invoice qty | Expected usable (outer×pack) | Actual usable | Correct today? | Notes |
|---------|------------:|-----------------------------:|--------------:|:--------------:|-------|
| **MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8** | 10 | 10.0 kg | **1.0 kg** | **No** | **Confirmed user-visible** |
| MEZZI PACCHERI MANCINI (CX 1KG*6) | 2 | 12.0 kg | 6.0 kg | Partial | Family A primary; €/kg accidentally correct at bound qty |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | 22.5 L | 11.25 L | Yes (UI) | Class C — op €3.73/L correct |
| SanPellegrino - Acqua in vitro 75cl x 15ud | 2 | 22.5 L | 11.25 L | Yes (UI) | Class C |
| Birra Peroni 33cl*24 | 24 | 190 L | 7.92 L | Yes (UI) | Class C — 24 bottles correct |
| Guanciale +/- 1,5kg*7 Sorrentino | 5.996 | ~6 kg (weight line) | 10.5 kg | **No** | **Different mechanism** (over-count) |

### Is Mozzarella truly isolated?

**Yes — for user-visible under-count pattern.**

| Metric | Value |
|--------|------:|
| Structural `SIZE_COUNT_RE` matches in VL | 6 |
| User-visible Mozzarella-pattern bugs | **1** |
| Additional user-visible expansion | **0** |
| VL status | **A) Isolated** |

Five structural matches share the code path but are **excluded** from Mozzarella expansion: UI economics correct (Peroni, S.Pellegrino×2) or primary bug is Family A / Guanciale.

**Confidence:** 0.92 — live replay reproduces persisted values; UI audit confirms single hit.

---

## Task 5 — Impact Analysis

**Scenario:** Correct usable **1 kg → 10 kg** for Bocconcino line (re-ingest or forward fix).

| Surface | Current (wrong) | After correction | Classification | Notes |
|---------|-----------------|------------------|----------------|-------|
| **Usable stock (UI)** | 1 kg | **10 kg** | **A — Direct** | Primary user-visible defect |
| **Operational cost (UI)** | €81.20/kg | **€8.12/kg** | **A — Direct** | `81.23 ÷ 10 kg`; ~10× decrease |
| **Procurement cost (UI)** | €8.12/unit | €8.12/unit | **C — Unchanged** | Per-pack price already correct |
| **Last purchase qty** | 10 un | 10 un | **C — Unchanged** | Invoice qty correct |
| **invoice_items** | qty=10, total=81.23 | unchanged | **C — Unchanged** | No extraction fix needed |
| **ingredients.current_price** | €8.12 | €8.12 (likely) | **B — Indirect** | Pack price unchanged; may update on re-sync |
| **ingredients.purchase_quantity** | 1 (catalog) | may shift | **B — Indirect** | `structuredPurchaseToIngredientFields` uses `purchaseContainerCount` |
| **ingredients.usable overlay** | 1000 g (or 125 g per old replay) | **10 000 g** | **A — Direct** | Recipe denominator |
| **ingredient_price_history** | Bocconcino `new_price=0.812` | may recompute | **B — Indirect** | Separate pack-format history issue (`.tmp/mozzarella-localized-investigation/`) |
| **Recipe cost** | Inflated €/kg in costing | **~10× lower** | **A — Direct** | Uses `usable_weight_grams` / op cost |
| **Dashboard margins** | Understates margin (high ingredient cost) | **Higher margin** | **B — Indirect** | If dashboard reads operational cost |
| **Opportunities / alerts** | P0 guard suppresses mozzarella alerts | may change | **B — Indirect** | `pack_weight_magnitude` guard active (`.tmp/mozzarella-localized-investigation/verdict.json`) |
| **Cross-format comparison** | 41% "decrease" signal (Aviludo vs Bocconcino) | still invalid | **C — Separate** | Identity collapse — not fixed by usable alone |

### Classification legend

- **A — Direct:** User-visible or recipe-cost surface changes immediately from usable correction
- **B — Indirect:** Propagates on re-ingest / sync; may need companion validation
- **C — Unchanged or separate issue:** Not caused by usable bug; out of scope

---

## Task 6 — Test Plan

**Frozen baselines:** `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-…json`, `.tmp/quantity-mismatch-ui-audit/replay.json`, `.tmp/phase1-validation-forensics-result.json`, `.tmp/bug-pattern-expansion-audit/population.json`

### Must correct (Mozzarella failure)

| # | Surface | Field | Current (wrong) | Expected after fix | Evidence |
|---|---------|-------|-----------------|-------------------|----------|
| 1 | Stock normalization replay | `normalizedUsableQuantity` | 1000 g | **10 000 g** | phase1 structured block |
| 2 | Ingredient detail | Usable stock label | 1 kg usable | **10 kg usable** | replay.json UI |
| 3 | Ingredient detail | Operational cost | €81.20/kg | **€8.12/kg** | 81.23 ÷ 10 kg |
| 4 | `computeEffectiveUsableCost` replay | cost/unit | 81.20/kg | **8.12/kg** | audit.mts |
| 5 | Presentation | `usableCostLine` | €81.20/kg usable | **€8.12/kg usable** | phase1 presentation |

### Must not regress (structural SIZE_COUNT controls)

| Product | Check | Expected unchanged |
|---------|-------|-------------------|
| STRACCIATELLA 250 GR (same invoice) | qty=24 → usable | 6 kg |
| Birra Peroni 33cl*24 | qty=24 → usable | 7.92 L; op cost correct |
| ACQUA S.PELLEGRINO (CX 75CL*15) | qty=2 → op €/L | €3.73/L |
| Guanciale 1,5kg*7 | usable direction | Must not flip to under-count; separate fix track |

### Checklist (manual / re-ingest)

- [ ] **Invoice row** — `f0aa5a08` Mozzarella line still shows qty=10, €8.12/unit, €81.23 total
- [ ] **Purchase history card** — Last 10 un · Proc €8.12/unit (unchanged)
- [ ] **Ingredient detail** — Usable **10 kg**; Op **€8.12/kg**
- [ ] **Operational cost block** — `€8.12 / kg usable` not €81.20
- [ ] **Recipe using Mozzarella fior di latte** — Ingredient line cost drops ~10× if recipe uses g/kg denominator
- [ ] **Dashboard** — Margin for recipes containing mozzarella increases (if applicable in VL)
- [ ] **Re-ingest `f0aa5a08`** — `syncOperationalIngredientCostsFromInvoiceLines` propagates corrected usable to `ingredients` row
- [ ] **Sibling lines on same invoice** — Pomodori, Rolo, Acqua, Stracciatella, Mezzi, Ricotta unchanged

---

## Task 7 — Implementation Readiness

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Root cause localized to function | **A) Proven** | `computeUsableFromPurchaseStructure` + `structureTotalIsFinalForGenericRow`; stage 8 first wrong value |
| Extraction ruled out | **A) Proven** | Stages 1–7 identical in root-causes.json, family-assessment, phase1 forensics |
| Live replay matches persisted | **A) Proven** | phase1 + quantity-mismatch-ui-audit replay.json |
| Isolation confirmed | **A) Proven** | bug-pattern-expansion-audit: 1/51 user-visible; 0 expansion |
| Guanciale decoupling understood | **A) Proven** | stock-normalization-family-assessment: same subsystem, different semantics |
| Fix design | **C) Unknown** | Intentionally not proposed in this document |
| Regression controls identified | **B) Needs validation** | 5 structural SIZE_COUNT rows need explicit negative tests before implementation |
| Re-ingest path | **B) Needs validation** | Confirm `syncOperationalIngredientCostsFromInvoiceLines` updates usable without manual DB edit |
| Cross-format identity (Aviludo 2Kg) | **B) Needs validation** | Separate W1 contamination; P0 guard active — not blocking usable fix but affects history UX |

### Ready for implementation?

**Yes — for scoped stock-normalization fix design**, with these preconditions:

1. Fix must **not** blanket-scale all `size_count` rows (Guanciale + Peroni/S.Pellegrino controls).
2. Implement with **frozen VL regression matrix** (Task 4 + Task 6).
3. Plan **re-ingest of `f0aa5a08`** to correct persisted ingredient economics.
4. Treat **price-history / cross-format comparison** as follow-on (`.tmp/mozzarella-localized-investigation/`), not blocking usable correction.

---

## Confidence

| Area | Score | Rationale |
|------|------:|-----------|
| Root cause localization | **0.94** | Stage-by-stage trace; first wrong at stage 8; code path mapped to functions |
| Value trace (qty/usable) | **0.93** | PDF 10 packs × 1 kg; replay 1000 g; control Stracciatella passes |
| Isolation | **0.92** | Full VL scan; 0 user-visible expansion |
| Change surface | **0.88** | Guanciale coupling requires careful scoping |
| Impact analysis | **0.90** | Direct op-cost math proven; history/identity secondary |
| **Overall readiness** | **0.91** | Proven root cause; fix design and regression harness still required |

---

## Sources

| Artifact | Use |
|----------|-----|
| `.tmp/remaining-bug-root-causes/` | Stage trace, first incorrect value |
| `.tmp/stock-normalization-family-assessment/` | Mozzarella vs Guanciale comparison |
| `.tmp/bug-pattern-expansion-audit/` | VL population, isolation proof |
| `.tmp/quantity-mismatch-ui-audit/` | UI replay, user-visible confirmation |
| `.tmp/phase1-validation-forensics-result.json` | DB + structured replay block |
| `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-…json` | Hybrid H extract (qty=10) |
| `.tmp/mozzarella-localized-investigation/` | Secondary: cross-format identity, P0 guard |
| `src/lib/stock-normalization.ts` | Parser + usable derivation |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat` |
| `src/lib/invoice-purchase-price-semantics.ts` | Operational cost chain |
