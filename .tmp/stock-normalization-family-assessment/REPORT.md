# Stock-Normalization Family Assessment — Mozzarella vs Guanciale

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** READ-ONLY — no code changes, no DB writes

---

## Mozzarella Trace

**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Line:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8  
**Invoice item:** `095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6`  
**Ingredient:** Mozzarella fior di latte (`2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`)

### Invoice reality

| Field | Value | Source |
|-------|------:|--------|
| Quantity | 10 packs | `.tmp/field-accuracy-audit/ground-truth.json` |
| Unit price (gross) | €9.50 | PDF |
| Total (net) | €81.23 | PDF |
| Pack notation | 125GR×8 = 1 kg per outer pack | Product name |
| Expected usable | **10 kg** (10 × 1 kg) | 10 packs × 8 × 125 g |
| Expected operational | **€8.12/kg** | €81.23 ÷ 10 kg |

### Stage-by-stage trace

| Stage | Qty | Unit price | Total | Usable | Correct? | Source |
|-------|----:|-----------:|------:|-------:|:--------:|--------|
| 1. PDF reality | 10 | 9.50 | 81.23 | 10 kg | ✓ | ground-truth.json |
| 2. OCR / GPT raw (Pass C era) | 10 | 9.50 | 81.23 | — | ✓ | pass-c-raw cache |
| 3. Pass C baseline | 10 | 9.50 | 81.23 | — | ✓ | passc-refinement reextract |
| 4. Hybrid H (v25) | 10 | 8.12 | 81.23 | — | ✓ | `extracts/f0aa5a08…json` |
| 5. bindMonetaryColumns | 10 | 8.12 | 81.23 | — | ✓ unchanged | replay.json |
| 6. reconcileLineItemAmounts | 10 | 8.12 | 81.23 | — | ✓ unchanged | production replay |
| 7. invoice_items persisted | 10 | 8.12 | 81.23 | — | ✓ | phase1-validation-forensics |
| 8. Purchase structure / stock norm | 10 | 8.12 | 81.23 | **1 kg** | **✗** | structured block |
| 9. Ingredient detail page | Last 10 un | Proc €8.12/unit | Op **€81.20/kg** | **1 kg** | **✗** | replay.json |
| 10. Procurement cost | purchaseQtyForCost=1 | €8.12/unit | — | — | internal only | resolveCountablePurchaseQuantityForCost |
| 11. Operational cost | — | — | €81.23 ÷ 1 kg | **€81.20/kg** | **✗** | computeEffectiveUsableCost |

### First incorrect value

| Field | PDF truth | First wrong | Stage |
|-------|----------:|------------:|-------|
| **Usable weight** | 10 000 g | **1 000 g** | **8 — stock normalization** |

Evidence: stages 1–7 preserve qty=10, unit_price=8.12, total=81.23. First deviation at `resolveInvoiceLinePurchaseFormat` → `normalizedUsableQuantity=1000`, `purchaseContainerCount=8` (`.tmp/phase1-validation-forensics-result.json` `additional.mozzarella fior.replay.structured`).

### User-visible impact

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase | 10 packs | 10 un | No |
| Procurement price | €8.12/pack | €8.12/unit | No |
| Usable stock | 10 kg | **1 kg** | **Yes** |
| Operational cost | €8.12/kg | **€81.20/kg** | **Yes** |

---

## Guanciale Trace

**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore, 2026-05-19)  
**Line:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)

### Invoice reality

| Field | Value | Source |
|-------|------:|--------|
| Quantity | 5.996 | `.tmp/mammafiore-line-audit/ground-truth.json` |
| Unit (PDF) | UN (weight semantics) | PDF column |
| Unit price (gross) | €16.922/kg | PDF |
| Total (net) | €64.93 | PDF |
| Pack notation | +/- 1,5kg×7 = supplier case shape | Product name |
| Expected usable | **~6 kg** (row weight) | qty=5.996 |
| Expected operational | **€10.83/kg** | €64.93 ÷ 5.996 kg |

### Stage-by-stage trace

| Stage | Qty | Unit price | Total | Usable | Correct? | Source |
|-------|----:|-----------:|------:|-------:|:--------:|--------|
| 1. PDF reality | 5.996 | 16.922 | 64.93 | ~6 kg | ✓ | mammafiore ground-truth |
| 2. OCR / GPT raw (Pass C era) | 5.996 | 16.922 | 64.93 | — | ✓ | pass-c-raw cache |
| 3. Pass C baseline | 5.996 | 16.922 | 101.59 | — | qty ✓; total run variance | passc reextract |
| 4. Hybrid H (v25) | 5.996 | 10.83 | 64.93 | — | ✓ | `extracts/36c99d19…json` |
| 5. bindMonetaryColumns | 5.996 | 10.83 | 64.93 | — | ✓ unchanged | replay.json |
| 6. reconcileLineItemAmounts | 5.996 | 10.83 | 64.93 | — | ✓ unchanged | production replay |
| 7. invoice_items persisted | 5.996 | 10.83 | 64.93 | — | ✓ | mismatches.json |
| 8. Purchase structure / stock norm | 5.996 | 10.83 | 64.93 | **10.5 kg** | **✗** | replay.json |
| 9. Ingredient detail page | Last 6.00 un | Proc €10.83/unit | Op **€6.18/kg** | **10.5 kg** | **✗** | replay.json |
| 10. Procurement cost | purchaseQtyForCost=1; containerCount=7 | €10.83/unit | — | — | internal only | replay.json |
| 11. Operational cost | — | — | €64.93 ÷ 10.5 kg | **€6.18/kg** | **✗** | computeEffectiveUsableCost |

### First incorrect value

| Field | PDF truth | First wrong | Stage |
|-------|----------:|------------:|-------|
| **Usable weight** | ~5 996 g | **10 500 g** | **8 — stock normalization** |

Evidence: stages 4–7 preserve qty=5.996, unit_price=10.83, total=64.93. First deviation: `purchaseContainerCount=7`, `normalizedUsable=10500` from `1,5kg*7` parse (replay.json `invoiceItemId 6efebedf…`).

### User-visible impact

| Surface | PDF truth | User sees | Wrong? |
|---------|-----------|-----------|:------:|
| Last Purchase | ~6 kg | 6.00 un | Borderline |
| Procurement price | €10.83/kg | €10.83/unit | Mislabeled unit |
| Usable stock | ~6 kg | **10.5 kg** | **Yes** |
| Operational cost | €10.83/kg | **€6.18/kg** | **Yes** |

---

## Shared Code Paths

Both bugs originate in the same downstream subsystem after correct monetary extraction.

```
PDF → OCR → Pass C → Hybrid H → bindMonetaryColumns → reconcileLineItemAmounts → DB persist
                                                                              ↓
                                                          resolveInvoiceLinePurchaseFormat
                                                                              ↓
                                                          normalizePurchasedToUsableStock
                                                                              ↓
                                                          parsePurchaseStructureFromText
                                                            (SIZE_COUNT_RE → tier: size_count)
                                                                              ↓
                                                          computeUsableFromPurchaseStructure
                                                            (structureTotalIsFinalForGenericRow)
                                                                              ↓
                                                          Ingredient detail / operational cost
```

| Function | Role | Shared? |
|----------|------|:-------:|
| `parsePurchaseStructureFromText` | Regex tier parser; both match `SIZE_COUNT_RE` | **Yes** |
| `purchaseStructureToPackPhrase` | Emits `multi_unit_pack` with `containerCount` = inner `*N` | **Yes** |
| `resolveStructurePurchaseQuantity` | Returns 1; does not use row qty for `size_count` + generic `un` | **Yes** |
| `computeUsableFromPurchaseStructure` | `structure_total` path; blocks row rescaling | **Yes** |
| `structureTotalIsFinalForGenericRow` | Policy: "name N×SIZE total is final" | **Yes** |
| `resolveInvoiceLinePurchaseFormat` | Orchestrator; persists structured usable | **Yes** |
| `resolveCountablePurchaseQuantityForCost` | Collapses to `purchaseQtyForCost=1` for both | **Yes** |

### Stock normalization path (function I/O)

| Function | Mozzarella input → output | Guanciale input → output |
|----------|---------------------------|--------------------------|
| `parsePurchaseStructureFromText` | `"125GR*8"` → tier `size_count`, inner=8, size=125 g, total=1000 g | `"1,5kg*7"` → tier `size_count`, inner=7, size=1.5 kg, total=10500 g |
| `purchaseStructureToPackPhrase` | → `multi_unit_pack`, containerCount=8, 125 g | → `multi_unit_pack`, containerCount=7, 1.5 kg |
| `resolveStructurePurchaseQuantity` | row qty=10, unit=un → **1** | row qty=5.996, unit=un → **1** |
| `computeUsableFromPurchaseStructure` | → usable=1000 g, source=`structure_total` | → usable=10500 g, source=`structure_total` |
| `resolveInvoiceLinePurchaseFormat` | → normalizedUsable=1000 g, purchaseContainerCount=8 | → normalizedUsable=10500 g, purchaseContainerCount=7 |
| `resolveCountablePurchaseQuantityForCost` | → purchaseQtyForCost=**1** | → purchaseQtyForCost=**1** |

**Control (same Bocconcino invoice):** Stracciatella `250 GR` at qty=24 uses tier `bare_measure` (no `SIZE×COUNT` token). `computeUsableFromPurchaseStructure` takes `structure_recomputed` path: `24 × 250 g = 6000 g` ✓. This proves the pipeline can scale by invoice qty when the name lacks an inner-count multiplier.

---

## Token Analysis

### Mozzarella: `125GR*8`, qty=10

| Token | Parser match | Interpretation | Correct for single pack? |
|-------|-------------|----------------|:------------------------:|
| `125GR` | SIZE in `SIZE_COUNT_RE` | 125 g per ball | ✓ |
| `*8` | COUNT in `SIZE_COUNT_RE` | 8 balls per outer pack | ✓ |
| Invoice qty `10` | Row field | 10 outer packs purchased | ✓ (extraction) |
| Combined usable | `8 × 125 g = 1 kg` per pack | **Not × 10** | **✗** |

**Driving token:** `*8` sets `innerUnitCount=8` and triggers `structureTotalIsFinalForGenericRow`, which prevents invoice qty=10 from scaling usable to 10 kg.

**Same parser?** Yes — `SIZE_COUNT_RE` in `parsePurchaseStructureFromText` (`stock-normalization.ts`).

### Guanciale: weight-based purchase, `*7` notation

| Token | Parser match | Interpretation | Correct? |
|-------|-------------|----------------|:--------:|
| `1,5kg` | SIZE in `SIZE_COUNT_RE` | ~1.5 kg per piece | Metadata only |
| `*7` | COUNT in `SIZE_COUNT_RE` | 7 pieces per supplier case | Metadata only |
| Invoice qty `5.996` | Row field (unit=UN) | **Kilograms purchased** | ✓ (extraction) |
| Combined usable | `7 × 1.5 kg = 10.5 kg` | Fiction replacing row weight | **✗** |

**Driving token:** `*7` sets `innerUnitCount=7`; combined with `1,5kg` yields 10500 g, overriding the weight-semantics row qty 5.996.

**Same parser?** Yes — same `SIZE_COUNT_RE` regex and `size_count` tier. Row unit `un` (generic) prevents `resolvePurchaseContainerCount` from detecting the weight line (`stock-normalization.ts` ~1446–1464).

---

## Causal Comparison

| Question | Mozzarella | Guanciale |
|----------|:----------:|:---------:|
| Wrong multiplier? | No — `*8` correctly describes inner pack | **Yes** — `*7` applied as purchased quantity |
| Wrong package structure? | Partial — per-pack structure OK; outer pack layer missing | **Yes** — supplier case notation treated as purchase |
| Double counting? | No | No |
| Weight/unit confusion? | No — count line | **Yes** — 5.996 kg sold as `UN` |
| Quantity ignored? | **Yes** — invoice qty=10 not applied to usable | **Yes** — row weight 5.996 kg discarded |
| Quantity applied twice? | No | No |

### Direction of error

| Product | Error direction | Mechanism |
|---------|----------------|-----------|
| Mozzarella | **Under-count** (1 kg vs 10 kg) | `structure_total` freezes at single-pack 1 kg; row qty=10 blocked |
| Guanciale | **Over-count** (10.5 kg vs ~6 kg) | `structure_total` uses 7×1.5 kg fiction instead of row weight |

Both share the blocking policy (`structureTotalIsFinalForGenericRow` + `usableSource: structure_total`), but the **semantic failure differs**: Mozzarella needs outer-pack multiplication; Guanciale needs weight-line recognition and suppression of case metadata.

---

## Bug Family Assessment

**Choice: B — Same subsystem, different root causes**

| Criterion | Assessment |
|-----------|------------|
| Same first-incorrect stage? | Yes — stage 8 (stock normalization) |
| Same code module? | Yes — `stock-normalization.ts` / `invoice-purchase-format.ts` |
| Same regex / tier? | Yes — `SIZE_COUNT_RE` → `size_count` |
| Same blocking policy? | Yes — `structureTotalIsFinalForGenericRow` |
| Same root cause? | **No** |
| Same fix? | **No** — would diverge |

**Why not A (same root cause):** Error directions oppose (under vs over). Mozzarella's `*8` parse is semantically correct for one pack; Guanciale's `*7` parse is semantically wrong for a weight line. A single multiplier fix cannot address both.

**Why not C (completely independent):** Both traverse identical parser tier and policy gate; live replay confirms identical `fallbackReason` string. They are siblings in the `size_count` + generic-row policy family, not unrelated bugs.

---

## Confidence

**Level: High (0.92)**

| Evidence | Finding |
|----------|---------|
| `.tmp/remaining-bug-root-causes/` | Independent traces agree: stage 8 first incorrect for both |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | Production-path replay: Mozzarella 1000 g / Guanciale 10500 g |
| `.tmp/phase1-validation-forensics-result.json` | Mozzarella structured block matches replay |
| `.tmp/final-validation-lab-rerun/extracts/` | Hybrid H qty correct for both (10 / 5.996) |
| Live `stock-normalization.ts` replay (2026-06-22) | Reproduces exact usable values and `structure_total` fallback |
| Stracciatella control (same invoice as Mozzarella) | `bare_measure` tier scales correctly → isolates `size_count` policy |

**Residual uncertainty:** Guanciale PDF unit column shows `UN` not `kg` (Pass C raw used `kg`; Hybrid H persisted `UN`). Weight semantics are inferred from qty magnitude and €/kg pricing, not from a canonical `kg` unit in the persisted row.

---

## Artefacts

| File | Role |
|------|------|
| `.tmp/stock-normalization-family-assessment/REPORT.md` | This report |
| `.tmp/stock-normalization-family-assessment/assessment.json` | Machine-readable assessment |
