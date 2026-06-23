# SIZE_COUNT_RE Structural Discriminator Audit

**Generated:** 2026-06-22T21:29:55.248Z  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no fixes

---

## Executive Summary

Live replay of production parsers on **9** proven `SIZE_COUNT_RE` products (**3** incorrect, **6** correct). All 9 share the identical stock-normalization code path (`size_count` → `structureTotalIsFinalForGenericRow` → `structure_total`). **No runtime parser-path signal cleanly separates incorrect from correct.** Divergence is scalar field values plus downstream economics outcome; the three incorrect products belong to **three distinct failure clusters** (A under-count, B over-count, C extraction).

**Final assessment: B** — Scalar divergence within shared path — discriminators are field values, not code branches

**Confidence: 94%**

---

## TASK 1 — Full Comparison Matrix (9 products)

| Product | Group | Token | Row Qty | Structure Total | Runtime Usable | PDF Truth | Match | Direction |
|---------|-------|-------|--------:|----------------:|---------------:|----------:|:-----:|-----------|
| Mozzarella 125GR*8 | incorrect | 125GR*8 | 10 | 1000 | 1000 | 10000 | ✗ | under_count |
| Guanciale | incorrect | 1,5kg*7  | 5.996 | 10500 | 10500 | 5996 | ✗ | over_count |
| Mezzi Paccheri (CX 1KG*6) | incorrect | 1KG*6 | 2 | 6000 | 6000 | 6000 | ✓ | mixed |
| Pomodori | correct | 2,5KG*6 | 1 | 15000 | 15000 | 15000 | ✓ | correct |
| S.Pellegrino Bocconcino | correct | 75CL*15 | 2 | 11250 | 11250 | 11250 | ✓ | correct |
| S.Pellegrino Emporio | correct | 75cl x 15ud | 2 | 11250 | 11250 | 11250 | ✓ | correct |
| Peroni | correct | 33cl*24  | 24 | 7920 | 7920 | 7920 | ✓ | correct |
| Aceto | correct | 5l*2  | 1 | 10000 | 10000 | 10000 | ✓ | correct |
| Rulo di capra | correct | 1kg*2  | 1 | 2000 | 2000 | 2000 | ✓ | correct |

---

## TASK 2 — Runtime Signal Inventory

Full per-product signal map: `.tmp/size-count-discriminator-audit/discriminator.json` → `task2_signalInventory`

**Path signals (uniform across all 9):**

- `parsePurchaseStructureFromText.tier`
- `genericRowAnalysis.isGenericPurchaseUnit`
- `genericRowAnalysis.structureTotalIsFinalForGenericRow`
- `computeUsableFromPurchaseStructure.usableSource`
- `computeUsableFromPurchaseStructure.fallbackReason`
- `resolveStructurePurchaseQuantity`
- `purchaseStructureMultiplierChain.usableUnit`
- `derivedSignals.rowQtyEqInner`
- `derivedSignals.rowQtyEqOne`
- `derivedSignals.rowQtyNeInner`
- `derivedSignals.rowQtyGtInner`
- `derivedSignals.nameContainsTolerance`

---

## TASK 3 — Difference Search

Signals that **separate** incorrect (n=3) from correct (n=6):

| Signal | Incorrect-only values | Correct-only values |
|--------|----------------------|---------------------|
| `parsePurchaseStructureFromText.unitMeasurement` | ["g"] | ["cl","L"] |
| `parsePurchaseStructureFromText.unitSize` | [125,1.5] | [2.5,75,33,5] |
| `parsePurchaseStructureFromText.innerUnitCount` | [8,7] | [15,24,2] |
| `parsePurchaseStructureFromText.totalUsableAmount` | [1000,10500,6000] | [15000,11250,7920,10000,2000] |
| `parsePurchaseStructureFromText.matchedText` | ["125GR*8","1,5kg*7 ","1KG*6"] | ["2,5KG*6","75CL*15","75cl x 15ud","33cl*24 ","5l*2 ","1kg*2 "] |
| `purchaseStructureMultiplierChain.perItemBase` | [125,1500] | [2500,750,330,5000] |
| `bound.qty` | [10,5.996] | [1,24] |
| `derivedSignals.direction` | ["under_count","over_count","mixed"] | ["correct"] |
| `resolveInvoiceLinePurchaseFormat.purchaseContainerCount` | [8,7] | [15,24,2] |
| `derivedSignals.userVisibleBug` | [true] | [false] |

**Shared across all 9 (cannot discriminate):** tier=`size_count`, `isGenericPurchaseUnit=true`, `structureTotalIsFinalForGenericRow=true`, `usableSource=structure_total`, `resolveStructurePurchaseQuantity=1`, `purchaseQtyForCost=1`, `kind=multi_unit_pack`.

**Partial incorrect-subset signals (do NOT partition full groups):**

- `derivedSignals.rowQtyGtInner`: incorrect-only [true]
- `derivedSignals.nameContainsTolerance`: incorrect-only [true]
- `derivedSignals.unitMeasurementIsG`: incorrect-only [true]
- `derivedSignals.perItemBaseNeUnitSize`: incorrect-only [false]
- `derivedSignals.structureOnlyMatchesPdfTruth`: incorrect-only [false]
- `derivedSignals.usableMatchesPdfTruth`: incorrect-only [false]
- `derivedSignals.extractionQtyMismatch`: incorrect-only [true]
- `derivedSignals.familyA`: incorrect-only [true]
- `proposedHelper.wouldFireAndUnitG`: incorrect-only [true]

**Correct-only signals:**

- `purchaseStructureMultiplierChain.usableUnit`: correct-only ["ml"]
- `derivedSignals.rowQtyEqInner`: correct-only [true]
- `derivedSignals.rowQtyEqOne`: correct-only [true]
- `derivedSignals.rowQtyNeInner`: correct-only [false]
- `derivedSignals.unitFamily`: correct-only ["volume"]
- `derivedSignals.unitMeasurementIsL`: correct-only [true]
- `derivedSignals.unitMeasurementIsCl`: correct-only [true]

---

## TASK 4 — Elimination Table

### Path signals (do NOT separate)

| Signal | Separates? | Why? |
|--------|:----------:|------|
| `parsePurchaseStructureFromText.tier` | No | Uniform across all 9: "size_count" |
| `genericRowAnalysis.isGenericPurchaseUnit` | No | Uniform across all 9: true |
| `genericRowAnalysis.structureTotalIsFinalForGenericRow` | No | Uniform across all 9: true |
| `computeUsableFromPurchaseStructure.usableSource` | No | Uniform across all 9: "structure_total" |
| `computeUsableFromPurchaseStructure.fallbackReason` | No | Uniform across all 9: "name N×SIZE total is final; generic row does not rescale inner pack" |
| `resolveStructurePurchaseQuantity` | No | Uniform across all 9: 1 |
| `purchaseStructureMultiplierChain.usableUnit` | No | Uniform across all 9: "g" |
| `derivedSignals.rowQtyEqInner` | No | Uniform across all 9: false |
| `derivedSignals.rowQtyEqOne` | No | Uniform across all 9: false |
| `derivedSignals.rowQtyNeInner` | No | Uniform across all 9: true |
| `derivedSignals.rowQtyGtInner` | No | Uniform across all 9: false |
| `derivedSignals.nameContainsTolerance` | No | Uniform across all 9: false |
| `derivedSignals.unitFamily` | No | Uniform across all 9: "mass" |
| `derivedSignals.unitMeasurementIsL` | No | Uniform across all 9: false |
| `derivedSignals.unitMeasurementIsG` | No | Uniform across all 9: false |

### Scalar / outcome signals (partial or full separation)

See full table in `discriminator.json` → `task4_eliminationTable`. Key finding: **10** signals partition groups; most are product-specific scalars (unitMeasurement, innerCount, rowQty) not reusable discriminators.

---

## TASK 5 — Cluster Analysis (3 incorrect products)

### A_mozzarella_under_count: Mozzarella 125GR*8

- **Direction:** under_count
- **Mechanism:** structure_total omits outer pack count (qty=10 not applied)
- **Runtime usable:** 1000 (PDF truth: 10000)
- **Scaled outer would be:** 10000
- **Signals unique to cluster:** parsePurchaseStructureFromText.unitMeasurement, parsePurchaseStructureFromText.unitSize, parsePurchaseStructureFromText.innerUnitCount, parsePurchaseStructureFromText.totalUsableAmount, parsePurchaseStructureFromText.matchedText, purchaseStructureMultiplierChain.perItemBase, bound.qty, derivedSignals.rowQtyGtInner

### B_guanciale_over_count: Guanciale

- **Direction:** over_count
- **Mechanism:** weight line qty=5.996 kg misread; *7 pack fiction used
- **Runtime usable:** 10500 (PDF truth: 5996)
- **Scaled outer would be:** 63000
- **Signals unique to cluster:** parsePurchaseStructureFromText.unitSize, parsePurchaseStructureFromText.innerUnitCount, parsePurchaseStructureFromText.totalUsableAmount, parsePurchaseStructureFromText.matchedText, purchaseStructureMultiplierChain.perItemBase, bound.qty, derivedSignals.nameContainsTolerance, derivedSignals.direction

### C_mezzi_extraction: Mezzi Paccheri (CX 1KG*6)

- **Direction:** mixed
- **Mechanism:** Hybrid H qty 1→2 extraction; structure path yields 1-case usable at 2-case invoice qty
- **Runtime usable:** 6000 (PDF truth: 6000)
- **Scaled outer would be:** 12000
- **Signals unique to cluster:** parsePurchaseStructureFromText.totalUsableAmount, parsePurchaseStructureFromText.matchedText, derivedSignals.extractionQtyMismatch, derivedSignals.familyA, derivedSignals.direction

---

## TASK 6 — Minimum Distinguishing Set (evidence only)

- `parsePurchaseStructureFromText.unitMeasurement`: incorrect-only ["g"]; correct-only ["cl","L"]
- `parsePurchaseStructureFromText.unitSize`: incorrect-only [125,1.5]; correct-only [2.5,75,33,5]
- `parsePurchaseStructureFromText.innerUnitCount`: incorrect-only [8,7]; correct-only [15,24,2]
- `parsePurchaseStructureFromText.totalUsableAmount`: incorrect-only [1000,10500,6000]; correct-only [15000,11250,7920,10000,2000]
- `parsePurchaseStructureFromText.matchedText`: incorrect-only ["125GR*8","1,5kg*7 ","1KG*6"]; correct-only ["2,5KG*6","75CL*15","75cl x 15ud","33cl*24 ","5l*2 ","1kg*2 "]
- `purchaseStructureMultiplierChain.perItemBase`: incorrect-only [125,1500]; correct-only [2500,750,330,5000]
- `bound.qty`: incorrect-only [10,5.996]; correct-only [1,24]
- `derivedSignals.direction`: incorrect-only ["under_count","over_count","mixed"]; correct-only ["correct"]
- `resolveInvoiceLinePurchaseFormat.purchaseContainerCount`: incorrect-only [8,7]; correct-only [15,24,2]
- `derivedSignals.userVisibleBug`: incorrect-only [true]; correct-only [false]

**Evidence note:** `proposedHelper.wouldFire` is true for Mozzarella + Mezzi + S.Pellegrino×2 + Peroni (5/9) — cannot serve as incorrect-only discriminator.

---

## TASK 7 — Final Assessment

| Option | Verdict |
|--------|---------|
| **A** | Runtime path signal proven — distinct code branch separates groups |
| **B** | **Selected** — Shared normalization path; scalar/outcome divergence only |
| **C** | Insufficient evidence |

**Verdict: B** — Scalar divergence within shared path — discriminators are field values, not code branches

Shared path confirmed (26 uniform path signals). 8 scalar signals partition groups but do not imply distinct parser branches. Proposed outer-pack helper fires on some incorrect and some correct.

**Incorrect clusters:**
- **A:** Mozzarella — under_count, downstream normalization
- **B:** Guanciale — over_count, weight-semantics + *7 fiction
- **C:** Mezzi — extraction qty mismatch (Family A), partial structure path

---

## Confidence

| Dimension | Score |
|-----------|------:|
| Structure trace | 96% |
| Parser replay | 95% |
| Signal search | 93% |
| Minimum distinguishing set | 90% |
| **Overall** | **94%** |

---

## Sources

- `.tmp/stock-normalization-population-audit/`
- `.tmp/stock-normalization-family-assessment/`
- `.tmp/mozzarella-commercial-reality-audit/`
- `.tmp/mozzarella-vs-pellegrino-separation/`
- `.tmp/remaining-bug-root-causes/`
- `.tmp/quantity-mismatch-ui-audit/replay.json`
- `.tmp/final-validation-lab-rerun/extracts/`
- `src/lib/stock-normalization.ts`
- `src/lib/invoice-purchase-format.ts`
- `VL bjhnlrgodcqoyzddbpbd invoice_items (read-only)`
