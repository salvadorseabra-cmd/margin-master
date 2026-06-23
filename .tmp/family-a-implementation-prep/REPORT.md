# Family A — Implementation Plan & Safety Check

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Confirmed failures:** MEZZI PACCHERI MANCINI (CX 1KG*6) · RICOTTA TREVIGIANA 1,5KG

**Confirmed facts (evidence-backed):**
- PDF/OCR/Pass C baseline qty=1 for both rows
- Hybrid H qty=2 (10/10 stable across v25–v36)
- First incorrect value at Hybrid H table GPT pass; downstream qty invariant
- Impact analysis + pattern expansion: no additional Family A products beyond these two

---

## Implementation Target

### Pipeline trace: Pass C → Hybrid H → bindMonetaryColumns → reconcile → persistence

```
index.ts (extract-invoice edge function)
│
├─ Pass A  extractIssueDateFromImage          → invoice_date
├─ Pass B  extractMetadataFromImage           → supplier  ← used by Option C supplier gate
├─ Pass C  extractFooterMetadataFromImage     → total, net_subtotal
└─ Pass D  extractTableItemsFromImage         ← Hybrid H table pass
       │
       └─ runTableExtractionPass()              invoice-table-extraction.ts
              ├─ cropTableRegionForLineItems()     image only; no qty
              ├─ callOpenAiJson()                  ★ QUANTITY AUTHORED HERE (GPT JSON)
              ├─ parseMonetaryLineItems()          copies row.quantity unchanged
              ├─ bindMonetaryColumns()             unit_price only; qty preserved
              ├─ monetaryToInvoiceLineItem()       strips discount_pct before API
              └─ reconcileLineItemAmounts()        skips rows with both price fields
       │
       └─ finalizeExtractedLineItems()          reconcileLineItemsToNetSubtotal (qty=1 only)
              │
              └─ JSON { supplier, items[] }    → client handoff

src/routes/invoices.tsx
└─ runExtraction()
       ├─ normalizeInvoiceItemFields()         name cleanup only; qty unchanged
       ├─ INSERT invoice_items                 quantity, unit, unit_price, total
       └─ syncOperationalIngredientCostsFromInvoiceLines()
```

### Exact code location where Hybrid H quantity is produced

| File | Function | Responsibility |
|------|----------|----------------|
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | `runTableExtractionPass` | Orchestrates crop → GPT → bind → reconcile |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | `callOpenAiJson` (L383–399) | **Authoritative qty source** — GPT vision reads QUANT column into structured JSON `quantity` field per `TABLE_EXTRACTION_SYSTEM_PROMPT` + `TABLE_EXTRACTION_RESPONSE_FORMAT` |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | `parseMonetaryLineItems` (L25–44) | Pass-through: `quantity: typeof row.quantity === "number" ? row.quantity : null` — no mutation |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | `bindMonetaryColumns` (L214–217) | Monetary binding only; `applyEffectivePaidPrice` divides `total ÷ qty` but **never assigns quantity** |
| `supabase/functions/extract-invoice/invoice-line-reconcile.ts` | `reconcileLineItemAmounts` (L68–85) | Family A rows have both `unit_price` and `total` → returned unchanged |
| `supabase/functions/extract-invoice/invoice-line-reconcile.ts` | `reconcileLineItemsToNetSubtotal` (L27–60) | Requires `quantity === 1`; does not touch Family A qty=2 rows |
| `supabase/functions/extract-invoice/index.ts` | handler (L179–195) | Passes items through `finalizeExtractedLineItems`; no qty logic |
| `src/routes/invoices.tsx` | `runExtraction` (L1339+) | Persists `quantity` as returned by edge function |

**First incorrect value:** quantity **1 → 2** between Pass C baseline (`passc-refinement-validation/reextract/f0aa5a08-…json`) and Hybrid H v25 extract (`final-validation-lab-rerun/extracts/f0aa5a08-…json`). Production replay confirms all deterministic post-GPT stages preserve qty=2.

### Earliest correction points (ranked)

| Rank | Location | Strategy | Rationale |
|------|----------|----------|-----------|
| **1 (recommended)** | `bindMonetaryColumns` input or `bindRow` pre-bind | **Option C** — deterministic qty correction using runtime-available signals (`discount_pct` absent, supplier, binding inflation signature) | Replay 100% recall/precision on frozen 15-row set; fixes qty before `applyEffectivePaidPrice` halves unit; no GPT variance |
| 2 | Between `parseMonetaryLineItems` and `bindMonetaryColumns` in `runTableExtractionPass` | **Option B** — post-GPT qty gate | Same effect as Option C; cleaner separation if new function added |
| 3 | `TABLE_EXTRACTION_SYSTEM_PROMPT` in `invoice-table-extraction.ts` | **Option A** — prompt refinement for undiscounted blank-DESC Bocconcino rows | Addresses root GPT cause; non-deterministic; existing anti-inflation rules already present yet Mezzi/Ricotta fail |
| 4 | `src/routes/invoices.tsx` | **Option D** — review-only | Zero extraction risk; does not fix automation |

**Not viable correction points:** `reconcileLineItemAmounts`, `finalizeExtractedLineItems`, persistence, procurement/UI layers — all qty-invariant downstream (proven in transition-trace, ricotta/mezzi traces, implementability audit).

---

## Change Surface

### Files needing modification

| File | Direct Change | Indirect Impact |
|------|---------------|-----------------|
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | **Option C (primary):** qty correction in `bindMonetaryColumns` / new pre-bind gate using `discount_pct`, `gross_unit_price`, `line_total_net`, `quantity`, `hasInconsistentGrossLineTotal`, supplier context | `applyEffectivePaidPrice` behavior changes for corrected rows (unit_price no longer halved); existing Rule B/E paths unchanged for non-trigger rows |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | **Option C:** pass `supplier` into binding if supplier gate required at extraction time; **Option A alt:** prompt edits to `TABLE_EXTRACTION_SYSTEM_PROMPT` | All table extractions (~every upload) if prompt path chosen |
| `supabase/functions/extract-invoice/invoice-monetary-binding.test.ts` | New unit tests for Family A trigger + negative controls | Regression harness for binding layer |
| `supabase/functions/extract-invoice/index.ts` | **Only if** supplier must reach binding: thread `metadataFromPass.supplier` into `extractTableItemsFromImage` | Minimal signature change; no qty logic today |
| `supabase/functions/extract-invoice/invoice-line-reconcile.ts` | None expected | Must verify net-subtotal reconcile still no-ops on corrected rows |
| `src/routes/invoices.tsx` | None for extraction fix | Re-ingest of `f0aa5a08` required to correct persisted qty=2; `syncOperationalIngredientCostsFromInvoiceLines` will propagate corrected economics |
| `src/lib/stock-normalization.ts` | None | Ricotta usable qty scales with corrected invoice qty (3 kg → 1.5 kg) |
| `src/lib/ingredient-cost*.ts` (procurement/operational resolvers) | None | Display values change on re-ingest per impact analysis |

### Files explicitly out of scope

| File | Reason |
|------|--------|
| `parseContinente.ts`, `parsePadaria.ts`, `stages.ts` | Not invoked (`index.ts` L69) |
| `invoice-crop-geometry.ts`, `invoice-image-crop.ts` | Crop geometry ruled out as mutation site (7-row passc reextract still qty=1) |
| DB migrations | No schema change required; `invoice_items` already stores `quantity` |

### Runtime signal adaptation (implementability gap)

Option C replay uses 3 investigation-only combo gates that must be **replaced or proxied** at implementation time (`family-a-implementability-audit`):

| Replay signal | Runtime replacement |
|---------------|---------------------|
| `ocr_qty_eq_1` (passc baseline) | `quantity === 2` AND `hasInconsistentGrossLineTotal` AND `unit_price ≈ total` (inflation signature implies OCR would have been 1) |
| `hybrid_h_qty_2_stable` (10/10 runs) | **Drop stability gate** OR use single-run conservative combo (supplier + undiscounted + inflation signature); stability gate blocked Rolo run 7 FP in replay |
| `undiscounted_blank_desc` (manual audit) | `discount_pct == null \|\| discount_pct === 0` at `bindMonetaryColumns` input (available before `monetaryToInvoiceLineItem` strips it) |

---

## Regression Checklist

Frozen baselines: `final-validation-lab-rerun/extracts/` (v25), `passc-refinement-validation/reextract/`, `final-stability-audit/extracts/f0aa5a08-all-runs.json`, `family-a-option-c-replay/replay-result.json`.

### Must correct (Family A failures)

| Product | Invoice | Field | Current (wrong) | Expected after fix | Evidence |
|---------|---------|-------|-----------------|-------------------|----------|
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | f0aa5a08 | `quantity` | 2 | **1** | scope-audit, mezzi trace, option-c-replay |
| | | `unit_price` (bound) | 13.65 | **~27.30** | phase1-validation-forensics |
| | | `total` | 27.30 | 27.30 (unchanged) | impact analysis |
| | | Last Purchase qty | 2 un | **1 uni** | quantity-mismatch-ui-audit |
| | | usable stock | 6 kg | 6 kg (unchanged) | impact analysis |
| | | operational €/kg | €4.55 | €4.55 (unchanged) | impact analysis |
| **RICOTTA TREVIGIANA 1,5KG** | f0aa5a08 | `quantity` | 2 | **1** | scope-audit, ricotta trace |
| | | `unit_price` (bound) | 3.99 | **~7.97** | phase1-validation-forensics |
| | | `total` | 7.97 | 7.97 (unchanged) | impact analysis |
| | | usable stock | 3 kg | **1.5 kg** | impact analysis |
| | | operational €/kg | €2.66 | **€5.31** | impact analysis |
| | | Last Purchase qty | 2 un | **1 uni** | quantity-mismatch-ui-audit |

### Must remain unchanged (controls)

| Product | Invoice | OCR Qty | Hybrid H Qty (v25) | Expected | Option C replay | Stability |
|---------|---------|--------:|-------------------:|----------|:---------------:|-----------|
| **POMODORI PELATI (CX 2,5KG*6)** | f0aa5a08 | 1 | 1 | 1 | PASS (no trigger) | 10/10 qty=1 |
| **ROLO DE CABRA E VACA 1KG** | f0aa5a08 | 1 | 1 | 1 | PASS (no trigger) | 9/10 qty=1 |
| **ACQUA S.PELLEGRINO (CX 75CL*15)** | f0aa5a08 | 2 | 2 | 2 | PASS (no trigger) | 9/10 qty=2 |
| MOZZARELLA FIOR DI LATTE 125GR*8 | f0aa5a08 | 10 | 10 | 10 | PASS | discounted row |
| Arroz / Açúcar / Pepinos | Aviludo May | 1 | 1 | 1 | PASS | pack rows stable |
| Aceto / Rulo Di Capra / Farina | Mammafiore | 1 | 1 | 1 | PASS | `*2` pack notation controls |
| **Gorgonzola DOP** | Emporio | 1.35 | 2 | 2 (legit) | PASS (no trigger) | intermittent; not Family A |

**Global gates** (`family-a-correction-validation-plan/PLAN.md`):
- Bocconcino invoice total €290.64 unchanged
- 13/13 non-failure candidates qty unchanged
- Gorgonzola qty=2 not forced to 1
- Rolo stable qty=1 not corrupted; transient run 7 (qty=2) must not false-positive

---

## Test Plan

Post-implementation validation sequence (read-only plan; execute after code deploy):

### 1. Extraction

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1.1 | Re-extract `f0aa5a08` image via edge function (deployed fix) | Mezzi qty=1, Ricotta qty=1 |
| 1.2 | Verify bound unit_price ≈ total at qty=1 (7.97, 27.30) | `implied_discount_pct < 5%` |
| 1.3 | 10× stability re-extract Bocconcino | Mezzi/Ricotta qty=1 in ≥9/10 runs |
| 1.4 | Single-run extract controls: Pomodori, Rolo, Acqua on same invoice | qty matches v25 baseline |
| 1.5 | Cross-invoice controls: Aviludo `3b4cb21f`, Mammafiore `36c99d19` | all qty unchanged |
| 1.6 | Emporio Gorgonzola negative | qty=2 preserved when discounted |

**Artifacts to compare:** `passc-refinement-validation/reextract/`, `final-validation-lab-rerun/extracts/`, `family-a-option-c-replay/replay-result.json`

### 2. Invoice

| Step | Action | Pass criteria |
|------|--------|---------------|
| 2.1 | Re-ingest corrected `f0aa5a08` (or fresh upload) | `invoice_items` Mezzi/Ricotta qty=1 |
| 2.2 | Line totals unchanged | 27.30, 7.97 |
| 2.3 | Invoice header total | €290.64 |
| 2.4 | Sibling lines unchanged | Pomodori, Rolo, Acqua, Mozzarella, Stracciatella |

### 3. Purchase history

| Step | Action | Pass criteria |
|------|--------|---------------|
| 3.1 | Ingredient detail Last Purchase — Ricotta | 1 uni, €7.97/unit |
| 3.2 | Ingredient detail Last Purchase — Mezzi | 1 uni, €27.30/case |
| 3.3 | Line totals in history | €7.97, €27.30 unchanged |

### 4. Ingredient

| Step | Action | Pass criteria |
|------|--------|---------------|
| 4.1 | `ingredients.current_price` Ricotta | ~€7.97 (not €3.99) |
| 4.2 | `ingredients.purchase_quantity` Ricotta | 1 (not 2) |
| 4.3 | `ingredient_price_history.new_price` Ricotta | ~€7.97 operational unit |
| 4.4 | Mezzi catalog fields | purchase_quantity=1, current_price ~€27.30 |

### 5. Procurement

| Step | Action | Pass criteria |
|------|--------|---------------|
| 5.1 | Procurement display Ricotta | €7.97/unit (not €3.99) |
| 5.2 | Procurement display Mezzi | €27.30/case (not €13.65) |
| 5.3 | `purchaseQtyForCost` | 1 for both (unchanged) |

### 6. Operational

| Step | Action | Pass criteria |
|------|--------|---------------|
| 6.1 | Ricotta usable stock label | **1.5 kg** (not 3 kg) |
| 6.2 | Ricotta operational cost | **€5.31/kg** (not €2.66/kg) |
| 6.3 | Mezzi usable stock | 6 kg (unchanged) |
| 6.4 | Mezzi operational €/kg | €4.55/kg (unchanged) |
| 6.5 | Mezzi split-brain resolved | Last Purchase 1 uni aligns with 6 kg usable |
| 6.6 | Family A mismatch alerts | cleared or reduced (`quantity-mismatch-validation`) |

---

## Remaining Risks

### A) Proven safe (evidence complete)

| Risk | Evidence |
|------|----------|
| Failure localized to Mezzi + Ricotta only | `family-a-scope-audit`: 2/15 candidates; `bug-pattern-expansion-audit`: 0 expansion |
| Downstream does not modify quantity | transition-trace, ricotta/mezzi traces, `invoice-monetary-binding.ts` code review |
| Option C replay separates failures from 10 controls + Gorgonzola | `family-a-option-c-replay`: 100% recall, 100% precision, 0 FP |
| Full 15-row population replay passes | `family-a-full-population-replay`: 15/15 verified |
| Invoice line totals preserved on correction | impact analysis: total unchanged for both rows |
| No sibling-line spillover on f0aa5a08 | impact analysis §4 |
| Gorgonzola excluded by supplier + discount + OCR≠1 gates | option-c-replay Gorgonzola analysis |
| Rolo stable path excluded; stability gate blocks run 7 FP | option-c-replay Rolo analysis |
| Pass C baseline qty=1 for failures | `passc-refinement-validation/reextract/f0aa5a08-…json` |
| Binding `applyEffectivePaidPrice` does not invent qty=2 | production replay in traces |

### B) Requires validation (post-implementation)

| Risk | Mitigation |
|------|------------|
| Runtime rule without `ocr_qty_eq_1` passc proxy may differ from replay | Validate against 15-candidate set on deployed edge function; compare to replay-result.json |
| Stability gate not observable at single-run runtime | Use conservative combo (supplier IL BOCCONCINO + undiscounted + inflation signature); monitor Rolo 1/10 transient |
| `discount_pct` proxy for blank DESC may miss edge cases | Verify Pomodori (discount_pct=20) and Rolo (null) on live extract |
| Re-ingest vs manual row edit divergence | Execute full re-ingest test plan §2–6; confirm `ingredient_price_history` rewrite |
| Ricotta downstream economics shift (€2.66→€5.31/kg) | Expected correction per impact analysis; validate recipe impact if Ricotta added to recipes later |
| Prompt path (Option A) non-determinism | Mandatory 10× stability if prompt chosen; not recommended as sole fix |
| Pre-bind gross unit_price persistence vs bound unit | Confirm DB stores expected field after correction (impact analysis §5 C) |

### C) Unknown

| Risk | Status |
|------|--------|
| Bad-path Hybrid H structured GPT raw JSON | **Missing** (`family-a-v25-raw-capture/artifact-index.json`: `v25HybridHRawGptCapture: none`). Inferred qty=2 at GPT layer (78% confidence); does not block Option C |
| Prompt vs schema causality for qty=2 | `family-a-causal-attribution`: anti-inflation prompt rules present yet fail; interaction hypothesis unproven |
| Rolo run 7 transient qty=2 root cause | GPT variance; not stable Family A; monitor only |
| Global rule without supplier scope | `effective-paid-contract-validation`: 12/15 rows flagged; supplier+Bocconcino scoping essential |

---

## Implementation Readiness

### Verdict: **READY FOR IMPLEMENTATION (Option C)** with pre-flight checks

| Gate | Status | Notes |
|------|--------|-------|
| Root cause localized | ✅ Complete | Hybrid H GPT pass; 88–91% confidence |
| Scope bounded | ✅ Complete | 2 products, 1 invoice, 1 supplier |
| Regression dataset frozen | ✅ Complete | 12 official + 15 extended candidates |
| Option C offline replay | ✅ Complete | 100% recall/precision (`family-a-option-c-replay`) |
| Full population replay | ✅ Complete | 15/15 (`family-a-full-population-replay`) |
| Implementability audit | ✅ Complete | Runtime proxies defined for RED signals |
| Impact mapping | ✅ Complete | Ricotta + Mezzi field matrix (`family-a-impact-analysis`) |
| Pattern expansion | ✅ Complete | 0 additional Family A products |
| Bad-path GPT raw capture | ⚠️ Optional | Gap remains; Option C does not require it |
| Correction strategy selection | ✅ **Option C** | Post-extraction binding gate recommended over prompt-only |
| Post-fix 10× stability | ⏳ Post-deploy | Mandatory validation step |
| VL re-ingest | ⏳ Post-deploy | Operational follow-on; DB already qty=2 |

### Recommended implementation approach

1. **Add Family A qty correction** in `invoice-monetary-binding.ts` inside or immediately before `bindMonetaryColumns`, using runtime-available signals:
   - `quantity === 2`
   - `discount_pct == null || discount_pct === 0` (undiscounted)
   - `hasInconsistentGrossLineTotal` true (total preserved, unit≈gross at implied qty=1)
   - `supplier` matches IL BOCCONCINO (thread from Pass B if needed)
   - Set `quantity = 1` before `applyEffectivePaidPrice` runs
2. **Unit tests** in `invoice-monetary-binding.test.ts` covering Mezzi, Ricotta, Pomodori, Rolo, Acqua, Gorgonzola from frozen extract fixtures.
3. **Deploy** edge function; run Test Plan §1 (extraction + stability).
4. **Re-ingest** `f0aa5a08` on VL; run Test Plan §2–6.

### Confidence

| Claim | Confidence |
|-------|------------|
| Implementation target correct (GPT pass, not downstream) | **91%** |
| Option C safe on frozen regression set | **88%** |
| No additional Family A products | **90%** |
| Runtime-adapted rule matches replay behavior | **75%** (requires post-deploy validation) |
| Overall implementation readiness | **82%** |

---

## Evidence index

| Artifact | Role |
|----------|------|
| `.tmp/ricotta-root-cause-trace/` | End-to-end Ricotta stage trace |
| `.tmp/mezzi-root-cause-trace/` | End-to-end Mezzi stage trace |
| `.tmp/family-a-transition-trace/` | Pass C → Hybrid H boundary |
| `.tmp/family-a-input-diff/` | Input differential |
| `.tmp/family-a-hybrid-diff-attribution/` | Prompt/crop/schema diff |
| `.tmp/family-a-causal-attribution/` | Prompt vs schema causality |
| `.tmp/family-a-impact-analysis/` | Downstream field matrix |
| `.tmp/bug-pattern-expansion-audit/` | No expansion beyond 2 products |
| `.tmp/family-a-option-c-replay/` | Option C viability proof |
| `.tmp/family-a-implementability-audit/` | Runtime signal mapping |
| `.tmp/family-a-scope-audit/` | 15-candidate population |
| `.tmp/passc-refinement-validation/` | Pass C baseline qty=1 |
| `.tmp/family-a-correction-validation-plan/` | Pass/fail criteria |
| `.tmp/family-a-fix-design/DESIGN.md` | Design options A–D |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | Production Hybrid H code |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | Binding layer (implementation target) |

**No code changes. No DB writes. No deployments.**
