# Guanciale — Implementation Preparation (READ-ONLY)

**Generated:** 2026-06-23  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes proposed  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore Portugal, 2026-05-19)  
**Confirmed failure:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino

**Confirmed facts (evidence-backed):**
- Stages 1–7 correct through persistence (qty=5.996, unit_price=10.83, total=64.93)
- First incorrect at stock normalization: usable **10.5 kg** not **~5.996 kg**; operational cost **€6.18/kg** not **€10.83/kg**
- Commercial reality **A — Proven**: ~5.996 kg purchased; `*7` is supplier case metadata (`.tmp/guanciale-commercial-reality-audit/`)
- Same subsystem as Mozzarella (`SIZE_COUNT_RE` + `structureTotalIsFinalForGenericRow`) but **different root cause** and **opposite direction** (over-count vs under-count)
- Pattern expansion: **1 user-visible product** in VL; unique among SIZE_COUNT rows (fractional qty + kg token + weight-priced economics)

---

## Task 1 — Implementation Target

### Pipeline trace: Invoice Item → Purchase Structure → Stock Normalization → Usable → Operational Cost

```
invoice_items (persisted)
│  qty=5.996, unit=un, unit_price=10.83, total=64.93
│  name: Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino
│
└─ syncOperationalIngredientCostsFromInvoiceLines / ingredient detail replay
       │
       └─ resolveInvoiceLinePurchaseFormat()          invoice-purchase-format.ts
              │
              ├─ parsePurchaseStructureFromText(name)    stock-normalization.ts:637
              │     └─ SIZE_COUNT_RE match "1,5kg*7"
              │           tier: size_count
              │           innerUnitCount: 7, unitSize: 1.5 kg
              │           totalUsableAmount: 10 500 g  (7×1.5 kg fiction)
              │
              ├─ normalizePurchasedToUsableStock()     stock-normalization.ts:1776
              │     └─ computeUsableFromPurchaseStructure()  stock-normalization.ts:1249
              │           ├─ resolveStructurePurchaseQuantity() → 1  (row qty blocked)
              │           ├─ structureTotalIsFinalForGenericRow() → true
              │           └─ usableQuantity: 10 500 g, usableSource: structure_total
              │
              └─ structuredFromExplicitPhrase() → StructuredPurchaseFormat
                    kind: multi_unit_pack
                    purchaseContainerCount: 7
                    normalizedUsableQuantity: 10 500 g

       └─ recipeOperationalCostFieldsFromInvoiceLine()   invoice-purchase-price-semantics.ts
              ├─ resolveCountablePurchaseQuantityForCost() → 1
              ├─ resolveUsablePerPricedUnit() → 10 500 g
              └─ computeEffectiveUsableCost() → €6.18/kg  (64.93 ÷ 10.5 kg)
```

### Earliest point usable becomes 10.5 kg (not ~5.996 kg)

| File | Function | Lines | Responsibility |
|------|----------|------:|----------------|
| `src/lib/stock-normalization.ts` | `SIZE_COUNT_RE` | 241–244 | Regex matches `1,5kg*7` as size×count token |
| `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` | 725–743 | Matches `1,5kg*7`; calls `buildInnerUnitsStructure` with inner=7, size=1.5 kg |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` | 443–461 | Forces `purchaseQuantity: 1` for size_count tier |
| `src/lib/stock-normalization.ts` | `buildStructure` | 578–614 | **First wrong structure total:** `1 × 7 × 1500 g = 10 500 g` |
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` | 1092–1106 | Returns `true` for size_count with inner count > 1 + generic row unit (`un`) |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` | 1148–1175 | With final-policy true → returns `1`, ignoring `rowQuantity=5.996` |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` | 1307–1318 | **First assignment of wrong final usable:** `total = structure.totalUsableAmount` (10 500 g); fallback `"name N×SIZE total is final; generic row does not rescale inner pack"` |

**Earliest incorrect transformation:** `buildStructure` at parse time sets `totalUsableAmount=10500` g by treating `*7` as purchased inner count (7 × 1.5 kg). `computeUsableFromPurchaseStructure` then locks that fiction via `structureTotalIsFinalForGenericRow` instead of using row weight 5.996 kg.

**Orchestration entry (not earliest bug):** `resolveInvoiceLinePurchaseFormat` calls the above; first wrong **persisted/displayed** usable appears as `normalizedUsableQuantity=10500` g (`.tmp/quantity-mismatch-ui-audit/replay.json`).

**Downstream amplification (not root cause):** `computeEffectiveUsableCost` divides line total €64.93 by 10.5 kg → **€6.18/kg** instead of €64.93 ÷ 5.996 kg ≈ **€10.83/kg**.

**Live production replay (2026-06-23):**

```
Input:  name="Guanciale … +/- 1,5kg*7 …", rowQuantity=5.996, rowUnit="un"
Output: normalizedUsableQuantity=10500, purchaseContainerCount=7
        usableSource=structure_total
        fallbackReason="name N×SIZE total is final; generic row does not rescale inner pack"
        expression="1 × 7 × 1.5 kg"
```

---

## Task 2 — Value Trace

**Product:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)

| Stage | Quantity | Package Structure | Usable Quantity | Correct? |
|-------|----------|-------------------|----------------:|----------|
| 1. PDF reality | 5.996 | `+/- 1,5kg*7` (case metadata) | **5 996 g (~6 kg)** | ✓ |
| 2. OCR / GPT raw (Pass C) | 5.996 | (in name) | — | ✓ |
| 3. Pass C baseline | 5.996 | — | — | ✓ (qty; total variance on run) |
| 4. Hybrid H (v25) | 5.996 | — | — | ✓ |
| 5. bindMonetaryColumns | 5.996 | — | — | ✓ |
| 6. reconcileLineItemAmounts | 5.996 | — | — | ✓ |
| 7. invoice_items persisted | 5.996 | — | — | ✓ |
| 8a. `parsePurchaseStructureFromText` | — | tier `size_count`, inner=7, size=1.5 kg, matched `1,5kg*7` | **10 500 g** (7×1.5 kg) | ✗ first wrong structure total |
| 8b. `computeUsableFromPurchaseStructure` | row qty 5.996, unit `un` | `purchaseContainerCount=1` | **10 500 g** (`structure_total`) | ✗ |
| 8c. `resolveInvoiceLinePurchaseFormat` | 5.996 | `multi_unit_pack`, `purchaseContainerCount=7` | **10 500 g** | ✗ |
| 9. Ingredient detail UI | Last 6.00 un | 7 × 1.5 kg | **10.5 kg usable** | ✗ |
| 10. Procurement cost | purchaseQtyForCost=1 | €10.83/unit | — | ✓ (line price preserved) |
| 11. Operational cost | — | €64.93 ÷ 10.5 kg | **€6.18/kg** | ✗ (should €10.83/kg) |

### First incorrect transformation (detailed)

```
Input:  name="…+/- 1,5kg*7 …", rowQuantity=5.996, rowUnit="un"

parsePurchaseStructureFromText:
  SIZE_COUNT_RE → innerUnitCount=7, unitSize=1.5, unitMeasurement=kg
  buildInnerUnitsStructure → purchaseQuantity=1, totalUsableAmount=10500

structureTotalIsFinalForGenericRow(structure, "un") → true
  (hasInner=true, tier=size_count, generic row unit)

resolveStructurePurchaseQuantity → 1  (invoice qty 5.996 blocked)

computeUsableFromPurchaseStructure → usableQuantity=10500, usableSource=structure_total

Expected at this stage: ~5996 g (row qty = billed kilograms)
  NOT 7 × 1.5 kg = 10500 g (supplier case shape metadata)
```

**Monetary proof (commercial reality A — Proven):**

```
5.996 kg × €16.922 gross/kg     = €101.59
Less 36% discount               = €36.57
Net total                         = €64.93  ✓

Correct operational cost        = €64.93 ÷ 5.996 kg = €10.83/kg
System operational cost         = €64.93 ÷ 10.5 kg  = €6.18/kg  ✗
10.5 kg path at invoice pricing = €113.72 net (Δ +€48.79 vs PDF)
```

**Control on same invoice:** Mozzarella julienne `3kg`, qty=10 → `bare_measure` tier → **30 000 g** (correct). Peroni `33cl*24`, qty=24 → **7 920 ml** (correct). Proves pipeline handles count-priced and bottle-count lines; Guanciale is the only weight-priced fractional `SIZE_COUNT_RE` line.

**Sources:** `.tmp/remaining-bug-root-causes/`, `.tmp/quantity-mismatch-ui-audit/replay.json`, `.tmp/stock-normalization-family-assessment/assessment.json`, `.tmp/guanciale-commercial-reality-audit/verdict.json`

---

## Task 3 — Change Surface

*Surface mapping only — no fix proposed. Documents locus if corrected at earliest incorrect stage.*

### Direct impact

| File | Change locus | Impact |
|------|--------------|--------|
| `src/lib/stock-normalization.ts` | `SIZE_COUNT_RE` (241–244) | Token match — currently captures `1,5kg*7` on weight lines |
| `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` (725–743) | size_count tier assignment for kg×count tokens |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` / `buildStructure` (443–614) | Sets `totalUsableAmount = purchaseQty × inner × perItem` → 10 500 g |
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` (1092–1106) | Policy gate — treats size_count inner totals as final for generic `un` rows |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` (1148–1175) | Returns `1` when final-policy triggers; blocks row weight 5.996 |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` (1307–1318) | Usable assignment — `structure_total` branch emits 10 500 g |
| `src/lib/stock-normalization.ts` | `shouldScaleOuterPackForSizeCountGenericRow` (1112–1123) | g-only outer scaling — **does not fire** on Guanciale (unitMeasurement=kg) |
| `src/lib/stock-normalization.test.ts` | SIZE×COUNT + weight-line cases | Regression harness for Guanciale + structural controls |

### Indirect impact (downstream of corrected usable)

| File | Function | Impact |
|------|----------|--------|
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat`, `structuredPurchaseToIngredientFields` | `normalizedUsableQuantity`, `purchaseContainerCount` propagate to catalog |
| `src/lib/invoice-purchase-price-semantics.ts` | `resolveUsablePerPricedUnit`, `computeEffectiveUsableCost`, `recipeOperationalCostFieldsFromInvoiceLine` | Op €/kg recomputes (6.18 → 10.83) |
| `src/lib/ingredient-auto-persist.ts` | `syncOperationalIngredientCostsFromInvoiceLines` | Re-ingest updates `ingredients` usable fields |
| `src/lib/ingredient-price-history.ts` | `operationalUnitPriceForPriceHistory` | History `new_price` may shift on re-ingest |
| `src/routes/invoices.tsx` | `runExtraction` / re-sync paths | Re-ingest of `36c99d19` required to correct persisted economics |

### Explicitly out of scope for this bug

| File | Reason |
|------|--------|
| `supabase/functions/extract-invoice/*` | Extraction stages 1–7 proven correct; qty=5.996 not mutated |
| Mozzarella outer-pack g scaling | Different mechanism (under-count); `shouldScaleOuterPackForSizeCountGenericRow` is g-only |

### Mozzarella coupling warning

Both bugs touch `structureTotalIsFinalForGenericRow` and `SIZE_COUNT_RE`. Mozzarella fix track (`shouldScaleOuterPackForSizeCountGenericRow`, g-only) **explicitly excludes** Guanciale (kg pack). Guanciale requires a **separate weight-line semantics guard**. A naive blanket change to always scale by row qty risks regressing Peroni (rowQty=innerCount), Rulo, Aceto, Pomodori where UI economics are correct (`.tmp/size-count-discriminator-audit/`).

**Discriminator audit verdict:** No runtime parser branch separates Guanciale from correct rows — scalar divergence only (`.tmp/size-count-discriminator-audit/discriminator.json` task7 verdict B).

---

## Task 4 — Regression Population (SIZE_COUNT_RE / weight)

**Scan scope:** All 51 VL `invoice_items` (7 invoices) through `SIZE_COUNT_RE` path.  
**Method:** `.tmp/stock-normalization-population-audit/population.json` live replay + `.tmp/quantity-mismatch-ui-audit/` UI corroboration + `.tmp/size-count-discriminator-audit/`.

### SIZE_COUNT_RE population (9 rows)

| Product | Invoice qty | Token | Expected usable | Actual usable | Correct today? | Cluster |
|---------|------------:|-------|----------------:|--------------:|:--------------:|---------|
| **Guanciale +/- 1,5kg*7** | **5.996** | `1,5kg*7` | **~5.996 kg** | **10.5 kg** | **No** | **B_guanciale_over_count** |
| MOZZARELLA 125GR*8 | 10 | `125GR*8` | 10.0 kg | 1.0 kg | No | A_mozzarella_under_count |
| MEZZI PACCHERI (CX 1KG*6) | 2 | `1KG*6` | 12.0 kg (PDF 1 case) | 6.0 kg | Partial | C_mezzi_extraction |
| POMODORI (CX 2,5KG*6) | 1 | `2,5KG*6` | 15.0 kg | 15.0 kg | Yes | — |
| ACQUA S.PELLEGRINO (75CL*15) | 2 | `75CL*15` | 11.25 L | 11.25 L | Yes | — |
| SanPellegrino 75cl x 15ud | 2 | `75cl x 15ud` | 11.25 L | 11.25 L | Yes | — |
| Birra Peroni 33cl*24 | 24 | `33cl*24` | 7.92 L | 7.92 L | Yes | — |
| Aceto 5l*2 | 1 | `5l*2` | 10 L | 10 L | Yes | — |
| Rulo Di Capra 1kg*2 | 1 | `1kg*2` | 2 kg | 2 kg | Yes | — |

### Guanciale uniqueness signals (discriminator audit)

| Signal | Guanciale | Correct SIZE_COUNT rows | Separates? |
|--------|:---------:|:-----------------------:|:----------:|
| `nameContainsTolerance` (`+/-`) | **true** | false (all 6) | Guanciale-only among 9 |
| `bound.qty` fractional (~kg) | **5.996** | integer (1, 2, 24) | Yes |
| `unitMeasurement` | **kg** | kg (Pomodori, Rulo, Mezzi) or cl/L | Partial |
| `direction` | **over_count** | correct | Outcome only |
| `structureOnlyMatchesPdfTruth` | **false** | true (6/6 correct) | Yes |
| `usableMatchesPdfTruth` | **false** | true (6/6 correct) | Yes |
| `proposedHelper.wouldFire` (Mozzarella g-scaling) | **false** | mixed | No safe partition |

### Is Guanciale truly isolated?

| Metric | Value | Classification |
|--------|------:|:--------------:|
| Structural `SIZE_COUNT_RE` matches in VL | 9 | — |
| User-visible Guanciale-pattern bugs (over-count, weight line) | **1** | **A) Isolated** |
| Additional user-visible expansion (same mechanism) | **0** | **A) Isolated** |
| Shared code path with Mozzarella / 7 other SIZE_COUNT rows | 9 | **B) Coupled** |
| Cross-invoice Guanciale SKU repeat | 0 | **C) Single exemplar** |

**VL status:** **A) Isolated** for user-visible over-count pattern; **B) Coupled** at code-path level; **C) Single exemplar** — no second Guanciale invoice to cross-validate weight-line heuristic.

**Confidence:** 0.92 — live replay reproduces persisted 10 500 g; UI audit class A; commercial reality A-Proven.

---

## Task 5 — Impact Analysis (10.5 kg → 5.996 kg)

**Scenario:** Correct usable **10.5 kg → ~5.996 kg** for Guanciale line (re-ingest or forward fix).

| Surface | Current (wrong) | After correction | Classification | Notes |
|---------|-----------------|------------------|----------------|-------|
| **Usable stock (UI)** | 10.5 kg | **~6 kg (5 996 g)** | **A — Direct** | Primary user-visible defect; ~43% mass reduction |
| **Operational cost (UI)** | €6.18/kg | **€10.83/kg** | **A — Direct** | `64.93 ÷ 5.996 kg`; ~75% increase in €/kg |
| **Procurement cost (UI)** | €10.83/unit | €10.83/unit | **C — Unchanged** | Line unit price already correct |
| **Last purchase qty** | 6.00 un (round) | ~6.00 un | **C — Unchanged** | Invoice qty 5.996 preserved |
| **invoice_items** | qty=5.996, total=64.93 | unchanged | **C — Unchanged** | No extraction fix needed |
| **ingredients.usable overlay** | 10 500 g | **5 996 g** | **A — Direct** | Recipe denominator |
| **ingredients.purchase_quantity** | 1 (catalog) | may shift | **B — Indirect** | `purchaseContainerCount=7` today |
| **ingredient_price_history** | stored `new_price=10.83` | may recompute | **B — Indirect** | Stale history signal (`.tmp/historical-pricing-integrity-audit/`) |
| **Recipe cost** | Understated €/kg (high usable mass) | **~75% higher €/kg** | **A — Direct** | Uses `usable_weight_grams` / op cost |
| **Dashboard margins** | Overstates margin (low ingredient cost) | **Lower margin** | **B — Indirect** | Opposite direction from Mozzarella fix |
| **Cross-format comparison** | N/A (single VL exemplar) | — | **C — Separate** | No second Guanciale invoice |

### Magnitude summary

| Metric | Delta | Formula |
|--------|------:|---------|
| Usable mass | **−4 504 g (−75%)** | 10 500 → 5 996 g |
| Operational €/kg | **+€4.65/kg (+75%)** | 6.18 → 10.83 |
| Line total | **€0** | Unchanged at €64.93 |
| Implied net if 10.5 kg were true | **+€48.79** | Rejected by PDF (commercial audit A) |

### Classification legend

- **A — Direct:** User-visible or recipe-cost surface changes immediately from usable correction
- **B — Indirect:** Propagates on re-ingest / sync; may need companion validation
- **C — Unchanged or separate issue:** Not caused by usable bug; out of scope

---

## Task 6 — Validation Checklist (Expected Values)

**Frozen baselines:** `.tmp/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`, `.tmp/quantity-mismatch-ui-audit/replay.json`, `.tmp/guanciale-commercial-reality-audit/verdict.json`, `.tmp/stock-normalization-population-audit/population.json`

### Must correct (Guanciale failure)

| # | Surface | Field | Current (wrong) | Expected after fix | Evidence |
|---|---------|-------|-----------------|-------------------|----------|
| 1 | Stock normalization replay | `normalizedUsableQuantity` | 10 500 g | **5 996 g** | replay.json `math.normalizedUsable` |
| 2 | Ingredient detail | Usable stock label | 10.5 kg usable | **~6 kg usable** | replay.json UI |
| 3 | Ingredient detail | Operational cost | €6.18/kg | **€10.83/kg** | 64.93 ÷ 5.996 kg |
| 4 | `computeEffectiveUsableCost` replay | cost/unit | 6.18/kg | **10.83/kg** | discriminator.json priceSemantics |
| 5 | `purchaseContainerCount` | container count | 7 (from `*7`) | TBD at fix-design | Must not imply 7 purchased units |
| 6 | Monetary closure | line total | €64.93 | **€64.93** (unchanged) | commercial-reality audit |

### Must not regress (structural SIZE_COUNT controls — same invoice `36c99d19`)

| Product | Check | Expected unchanged |
|---------|-------|-------------------|
| Birra Peroni 33cl*24 | qty=24 → usable | 7.92 L; op €3.24/L |
| Aceto balsamico 5l*2 | qty=1 → usable | 10 L; op €1.56/L |
| Rulo Di Capra 1kg*2 | qty=1 → usable | 2 kg; op €5.43/kg |
| MOZZA Julienne 3kg | qty=10 → usable | 30 kg |
| Farina Amoruso 25kg | qty=1 → usable | 25 kg (weight_based) |

### Must not regress (cross-invoice SIZE_COUNT)

| Product | Invoice | Expected unchanged |
|---------|---------|-------------------|
| POMODORI PELATI (CX 2,5KG*6) | f0aa5a08 | 15 kg |
| ACQUA S.PELLEGRINO (CX 75CL*15) | f0aa5a08 | 11.25 L; op €3.73/L |
| SanPellegrino 75cl x 15ud | ab52796d | 11.25 L |
| MOZZARELLA 125GR*8 | f0aa5a08 | Must not flip to under-count further; separate fix track |

### Checklist (manual / re-ingest)

- [ ] **Invoice row** — `36c99d19` Guanciale line still shows qty=5.996, €10.83/unit, €64.93 total
- [ ] **Purchase history card** — Last ~6 un · Proc €10.83/unit (unchanged)
- [ ] **Ingredient detail** — Usable **~6 kg**; Op **€10.83/kg**
- [ ] **Operational cost block** — `€10.83 / kg usable` not €6.18
- [ ] **Recipe using Guanciale stagionato** — Ingredient line cost increases if recipe uses g/kg denominator
- [ ] **Re-ingest `36c99d19`** — `syncOperationalIngredientCostsFromInvoiceLines` propagates corrected usable
- [ ] **Sibling lines on same invoice** — Peroni, Aceto, Mozzarella julienne, Rulo, Farina unchanged
- [ ] **Mozzarella coupling check** — If Mozzarella fix landed, Guanciale fix must not break Mozzarella controls or flip to under-count

---

## Task 7 — Implementation Readiness

*Benchmark: `.tmp/mozzarella-implementation-prep/` at pre-fix-design level (prep complete; fix design intentionally deferred).*

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Root cause localized to function | **A) Proven** | `parsePurchaseStructureFromText` + `computeUsableFromPurchaseStructure` + `structureTotalIsFinalForGenericRow`; stage 8 first wrong value 10 500 g |
| Extraction ruled out | **A) Proven** | Stages 1–7 identical in root-causes.json; qty=5.996, total=64.93 preserved |
| Live replay matches persisted | **A) Proven** | quantity-mismatch-ui-audit replay.json 10 500 g = UI 10.5 kg |
| Commercial reality proven | **A) Proven** | guanciale-commercial-reality-audit verdict A; monetary closure to €64.93 at 5.996 kg |
| Isolation confirmed (user-visible) | **A) Proven** | 1/51 VL row; cluster B_guanciale_over_count; 0 expansion |
| Mozzarella decoupling understood | **A) Proven** | stock-normalization-family-assessment: same subsystem, opposite semantics |
| Change surface mapped | **A) Proven** | This document Task 3 |
| Regression controls identified | **B) Needs validation** | 6 SIZE_COUNT negatives on same + cross-invoice invoices; no Guanciale-specific positive matrix executed post-design |
| Runtime fix discriminator | **C) Missing** | size-count-discriminator-audit verdict B; no proven safe branch |
| Fix design | **C) Not in scope** | Intentionally deferred (per charter) |
| Re-ingest path | **B) Needs validation** | Confirm sync propagates usable without manual DB edit |
| Price-history follow-on | **B) Needs validation** | Stale history signal; post-fix validation needed |
| Single exemplar | **B) Residual risk** | No second Guanciale invoice in VL |

### Ready for implementation?

**Yes — for scoped stock-normalization fix design**, at Mozzarella pre-fix-design bar, with these preconditions:

1. Fix must **not** blanket-scale all `size_count` rows (Peroni rowQty=innerCount, Rulo/Aceto qty=1 controls).
2. Fix must **not** reuse Mozzarella g-only outer scaling (`shouldScaleOuterPackForSizeCountGenericRow` does not fire on Guanciale).
3. A **weight-line semantics guard** must be designed and proven safe before code change (discriminator gap).
4. Implement with **frozen VL regression matrix** (Task 4 + Task 6).
5. Plan **re-ingest of `36c99d19`** to correct persisted ingredient economics.
6. Treat **price-history** as follow-on, not blocking usable correction.

**Not ready for:** code change or re-ingest until fix-design artifact specifies guard conditions and acceptance criteria.

---

## Confidence

| Area | Score | Rationale |
|------|------:|-----------|
| Root cause localization | **0.94** | Stage-by-stage trace; code path mapped to functions; live replay |
| Commercial reality | **0.94** | A-Proven monetary closure; dedicated commercial-reality audit |
| Value trace (qty/usable) | **0.93** | PDF 5.996 kg; replay 10 500 g; peer lines on same invoice |
| Isolation (user-visible) | **0.92** | Full VL scan; 0 expansion for over-count pattern |
| Change surface | **0.86** | Mozzarella coupling + no runtime discriminator lowers fix-surface confidence |
| Impact analysis | **0.91** | Direct op-cost math proven; history secondary |
| **Overall readiness (prep level)** | **0.90** | Matches Mozzarella pre-fix-design bar; fix design and discriminator still required |

---

## Sources (read-only)

| Artifact | Use |
|----------|-----|
| `.tmp/guanciale-commercial-reality-audit/` | Commercial truth A-Proven; monetary reconciliation |
| `.tmp/guanciale-readiness-audit/` | Prior NOT READY verdict; blocker inventory |
| `.tmp/remaining-bug-root-causes/` | Stage trace, first incorrect value |
| `.tmp/stock-normalization-family-assessment/` | Guanciale vs Mozzarella causal comparison |
| `.tmp/stock-normalization-population-audit/` | VL population, SIZE_COUNT path |
| `.tmp/size-count-discriminator-audit/` | Blocker: no runtime discriminator |
| `.tmp/quantity-mismatch-ui-audit/` | UI replay, class A confirmation |
| `.tmp/mammafiore-line-audit/` | PDF ground truth |
| `.tmp/mozzarella-implementation-prep/` | Readiness benchmark (pre-fix-design) |
| `.tmp/final-validation-lab-rerun/extracts/36c99d19-…json` | Hybrid H extract (qty=5.996) |
| `.tmp/historical-pricing-integrity-audit/findings.json` | Stale history signal |
| `src/lib/stock-normalization.ts` | Parser + usable derivation |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat` |
| `src/lib/invoice-purchase-price-semantics.ts` | Operational cost chain |
| VL DB read-only (`bjhnlrgodcqoyzddbpbd`) | `invoice_items`, `ingredients` |
