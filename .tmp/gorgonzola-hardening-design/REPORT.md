# Gorgonzola Pass C Hardening Fix — Design Only

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT DESIGN ONLY · **Date:** 2026-06-24  
**No code changes · No DB writes · No deployments**

## Executive summary

Pass C (Hybrid H / `invoice-table-extraction.ts`) hallucinates **qty 1.05 or 2.00** and **unit_price** while OCR-era extraction (`pass-c-raw`) correctly read **qty 1.35**. The current production pipeline has **no OCR qty signal** at Pass C time — Hybrid H is a single vision GPT call with no upstream quantity anchor. Downstream `bindMonetaryColumns` → `reconcileLineItemAmounts` → `normalizeInvoiceItemFields` → persist are **lossless pass-through on quantity**.

Math reconciliation guardrail is **already implemented** in `src/lib/invoice-extraction-review.ts` and wired into `needsExtractionConfirmation` — it catches the v28 failure (1.05/10.88/13.44) but **misses** the v38 re-read failure (2.00/9.35/18.72) because that triple is internally consistent.

**Recommended fix:** **D) OCR anchoring + validation** — add a lightweight qty pre-pass before structured Pass C; anchor Pass C quantity when pre-pass disagrees and reconciles better with `line_total_net`; retain existing math review gate and add OCR-vs-Pass-C mismatch detection for internally-consistent hallucinations.

**Scope question:** **B) Small OCR-vs-Pass-C family** — fractional-kg Emporio rows where qty pre-pass and structured Pass C can diverge; stable controls (Prosciutto, Bresaola) become no-ops.

**Differentiation from prior design** (`.tmp/gorgonzola-fix-design/`): prior recommended prompt + validation (Rule F + `needsMathConfirmation`). This hardening design adds **OCR qty anchoring** as the direct fix for "Pass C overriding OCR-correct qty" and treats prompt delta as adjunct only (proven insufficient alone).

---

## Known facts (do NOT re-investigate)

| Source | Qty | Unit price | Total | Reconciles? |
|--------|-----|------------|-------|-------------|
| PDF | 1.35 kg | net €9.95 | €13.44 | YES |
| OCR pass-c-raw | 1.35 | €9.82 | €13.44 | NO (net slip) |
| Structured v28 | **1.05** | **€10.88** | €13.44 | **NO** (11.42 ≠ 13.44) |
| v38 re-read | **2.00** | **€9.35** | **18.72** | YES (internally) — **wrong vs PDF** |

- Binding/persistence: pass-through proven
- Gorgonzola unstable at Pass C; Prosciutto/Mortadella/Bresaola stable (v30+)
- Math guard: `invoice-extraction-review.ts` — `needsMathematicalReconciliationReview` (€0.50 AND 5%)

---

## T1 — Pass C architecture trace

### Pipeline (current production)

```
imageDataUrl
  │
  ├─ Pass A  extractIssueDateFromImage          → invoice_date
  ├─ Pass B  extractMetadataFromImage           → supplier
  ├─ Pass C₁ extractFooterMetadataFromImage   → total, net_subtotal, vat
  │
  └─ Pass C₂ / Hybrid H  extractTableItemsFromImage
        │
        ├─ cropTableRegionForLineItems(image)     → cropped table PNG
        │
        ├─ callOpenAiJson(                       ← **QTY ORIGINATES HERE**
        │     TABLE_EXTRACTION_SYSTEM_PROMPT,
        │     TABLE_EXTRACTION_RESPONSE_FORMAT)  → {qty, gross, discount, line_total_net}
        │     **No OCR/pre-pass qty injected into prompt or post-process**
        │
        ├─ parseMonetaryLineItems               → preserves GPT quantity verbatim
        ├─ bindMonetaryColumns                  → qty UNCHANGED; binds unit_price/total only
        ├─ reconcileLineItemAmounts             → qty UNCHANGED; preserves both cols when present
        └─ monetaryToInvoiceLineItem            → API {name, quantity, unit, unit_price, total}
  │
  ├─ finalizeExtractedLineItems(net_subtotal)   → may adjust line totals, NOT quantities
  └─ extract-invoice API response
        │
        └─ invoices.tsx runExtraction
              ├─ normalizeInvoiceItemFields     → no-op for Gorgonzola qty
              ├─ insert invoice_items
              ├─ needsExtractionConfirmation    → includes needsMathematicalReconciliationReview
              └─ autoPersistUnmatchedInvoiceItems (blocked when confirmation needed)
```

### Where OCR qty is available today

| Stage | OCR / qty signal | Available at Pass C? |
|-------|------------------|----------------------|
| Deterministic parsers (`parseContinente`, `stages.ts`) | Text OCR → regex qty | **NO** — not invoked (`index.ts` L69) |
| Legacy pass-c-raw (pre-Hybrid H) | GPT `{quantity, unit_price, total}` | **NO** — audit artifact only |
| Pass C₂ Hybrid H GPT output | Vision-read qty column | **YES** — sole qty source |
| Footer pass | Invoice total only | Partial — no per-row qty |
| Client persist | Prior DB rows | Only on re-read of same invoice |

**Conclusion:** OCR-correct qty (1.35) exists only in historical `pass-c-raw` artifacts. Current Pass C **re-extracts qty from scratch** with no anchor — this is the override mechanism.

### Where Pass C overwrites OCR-correct qty

There is no merge step. Hybrid H **replaces** the entire row. On re-read (`invoices.tsx` DELETE+INSERT), any prior correct qty is discarded. The overwrite happens at `callOpenAiJson` response parsing — `parseMonetaryLineItems` accepts GPT `quantity` without cross-check.

---

## T2 — Design options

### Option A — Prompt-only

Add fractional digit guard (3↔5), mandatory Emporio Desc.(%), negative 1.05/10.88 example (~12 lines after L125).

| Dimension | Assessment |
|-----------|------------|
| Effectiveness | **LOW** — correct Gorgonzola example already at L107–108; v28 failed despite it |
| Blast radius | Minimal |
| Complexity | ~12 prompt lines |
| Risk | High residual — no safety net; v38 re-read proves recurrence |
| Prevents OCR override? | **NO** — no OCR signal in prompt |

### Option B — OCR anchoring only

Add qty pre-pass; when `|prepass_qty − passC_qty| > ε`, prefer pre-pass qty if it reconciles better with `line_total_net`.

| Dimension | Assessment |
|-----------|------------|
| Effectiveness | **HIGH on qty** — 1.35 preserved when Pass C emits 1.05 or 2.00 |
| Blast radius | Fractional-kg Emporio rows with pre-pass disagreement only |
| Complexity | ~80–100 lines: pre-pass schema, row matching, anchor rule in `bindMonetaryColumns` or new `anchorQuantities` |
| Risk | Low on stable controls (OCR ≈ Pass C → no-op); medium if pre-pass also misreads |
| Prevents OCR override? | **YES** — direct fix |
| Gap | Alone misses re-read when **both** qty and total are wrong but self-consistent |

### Option C — Validation only

Extend or rely on `invoice-extraction-review.ts` math gate.

| Dimension | Assessment |
|-----------|------------|
| Effectiveness | **PARTIAL** — catches 1.05/10.88/13.44 (15.03%); **misses** 2.00/9.35/18.72 (0% variance) |
| Blast radius | 1 VL row at current thresholds |
| Complexity | **Already implemented** — `needsMathematicalReconciliationReview` wired at `invoices.tsx` L527 |
| Risk | False positives at naive thresholds ruled out (Aceto 3.36% below gate) |
| Prevents OCR override? | **NO** — detection only; does not restore OCR qty |

### Option D — Hybrid (OCR anchoring + validation)

Pre-pass qty anchor + existing math review + new OCR-vs-Pass-C mismatch flag.

| Dimension | Assessment |
|-----------|------------|
| Effectiveness | **HIGH** — anchoring fixes qty; validation catches residual math failures; mismatch flag catches self-consistent wrong totals |
| Blast radius | Gorgonzola + any future fractional Emporio divergence |
| Complexity | ~100–120 lines total |
| Risk | **LOW** — layered; stable rows unaffected |
| Prevents OCR override? | **YES** |

### Option E — Other (deferred)

| Variant | Notes |
|---------|-------|
| Row re-extract on math fail | Non-deterministic; higher cost |
| Block legacy `unit_price` in parser | Adjunct; does not fix qty |
| Dual full-schema parallel pass | 2× GPT cost; overkill vs qty-only pre-pass |

---

## T3 — OCR anchoring design

### Proposed architecture

```
cropTableRegionForLineItems
  │
  ├─ NEW: runQuantityPrePass(croppedImage)     → [{name, quantity, unit}]  (minimal schema)
  │
  └─ runTableExtractionPass (Hybrid H)         → full structured rows
        │
        └─ NEW: anchorQuantities(prepass, structured)
              → per-row qty decision
              → bindMonetaryColumns (existing)
```

### Pre-pass specification

| Property | Value |
|----------|-------|
| Schema | `{ items: [{ name: string, quantity: number\|null, unit: string\|null }] }` |
| Prompt focus | "Copy quantity ONLY from Qtd column. Ignore description tokens (1/8, ~1,5kg, pack *N)." |
| Model | Same gpt-4.1, temp 0, seed 42 |
| Cost | +1 GPT call per extraction (~same crop image) |
| Row matching | Index-aligned within cropped table; fallback fuzzy name match |

### Anchoring decision tree

**Inputs per row:** `ocr_qty`, `passC_qty`, `line_total_net`, `gross_unit_price`, `discount_pct`

```
IF ocr_qty IS NULL OR passC_qty IS NULL → keep passC_qty (no anchor)

Δ = |ocr_qty - passC_qty| / max(ocr_qty, 0.01)

IF Δ ≤ 0.02 → keep passC_qty (agreement)

IF Δ > 0.02:
  score_ocr = |line_total_net - ocr_qty × deriveNet(gross, discount)|  (if line_total_net present)
  score_passC = |line_total_net - passC_qty × passC_unit_price|

  IF score_ocr < score_passC - €0.10 → ANCHOR ocr_qty
  ELSE IF math fails on passC (needsMathematicalReconciliationReview) AND score_ocr ≤ €0.50 → ANCHOR ocr_qty
  ELSE → keep passC_qty, FLAG OCR_QTY_MISMATCH for review
```

### Scenario replay

#### Scenario 1: OCR=1.35, Pass C=1.05, line_total_net=13.44

| Step | Result |
|------|--------|
| Δ | \|1.35−1.05\|/1.35 = **22.2%** |
| score_ocr | \|13.44 − 1.35×9.95\| ≈ **€0.07** (with gross 12.90, disc 22.85) |
| score_passC | \|13.44 − 1.05×10.88\| = **€2.02** |
| Decision | **ANCHOR 1.35** |
| After rebind | qty 1.35, unit_price ≈ 9.96, total 13.44 ✓ |

#### Scenario 2: OCR=1.35, Pass C=2.00, line_total_net=13.44 (total preserved)

| Step | Result |
|------|--------|
| Δ | \|1.35−2.00\|/1.35 = **48.1%** |
| score_ocr | ≈ **€0.07** |
| score_passC | \|13.44 − 2×9.35\| ≈ **€5.26** (if unit synthesized) |
| Decision | **ANCHOR 1.35** |
| After rebind | qty 1.35, unit_price ≈ 9.96, total 13.44 ✓ |

#### Scenario 3: OCR=1.35, Pass C=2.00, line_total_net=18.72 (v38 re-read)

| Step | Result |
|------|--------|
| Δ | **48.1%** |
| score_ocr | \|18.72 − 1.35×9.95\| ≈ **€5.29** (total also wrong) |
| score_passC | \|18.72 − 2×9.35\| ≈ **€0.02** (self-consistent) |
| Decision | **Keep Pass C qty** on score alone — BUT |
| Mismatch flag | `OCR_QTY_MISMATCH` at Δ>10% on fractional kg → **REVIEW** |
| Math gate | Passes (internally consistent) — **anchoring alone insufficient** |
| Combined | Mismatch flag blocks silent cost persist; user confirms |

#### Scenario 4: Prosciutto OCR=4.30, Pass C=4.30 (control)

| Step | Result |
|------|--------|
| Δ | **0%** |
| Decision | **No-op** — passC_qty kept |

### Scope gate (family B)

Apply anchoring only when **all** of:

1. `unit` is `kg` (or normalized weight unit)
2. `ocr_qty` is fractional (`ocr_qty % 1 ≠ 0` OR `ocr_qty < 10` with decimal)
3. Supplier crop matches Emporio dense table (8-column) OR row has `discount_pct` column semantics

Integer pack rows (Paccheri 24, Ginger Beer 24) and MO herbs (Tomilho 1 mo) are **excluded** — no pre-pass override.

---

## T4 — Validation layer

### Existing guard (implemented)

```typescript
// invoice-extraction-review.ts L63-72
needsMathematicalReconciliationReview:
  variance_abs > €0.50 AND variance_pct > 5%
```

Wired at `invoices.tsx` L523–527 inside `needsExtractionConfirmation`.

### Proposed thresholds

| Class | Condition | Action |
|-------|-----------|--------|
| **SAFE** | variance_abs ≤ €0.10 OR variance_pct < 1% | Auto-persist |
| **WARNING** | 1% ≤ variance_pct < 3% OR legitimate discount row | Log only; Aceto 3.36% stays SAFE |
| **REVIEW** | variance_abs > €0.50 **AND** variance_pct > 5% | Block auto cost persist (current) |
| **REVIEW+** | \|ocr_qty − passC_qty\| / ocr_qty > 10% on scoped family rows | New `OCR_QTY_MISMATCH` reason code |
| **CRITICAL** | variance_pct > 10% | Same as REVIEW; Gorgonzola 15.03% |

### Detection before persist (proposed flow)

```
extract-invoice response
  → anchorQuantities (edge, if pre-pass enabled)
  → client insert invoice_items
  → for each row:
       needsMathematicalReconciliationReview(item)     → math REVIEW
       needsOcrQtyMismatchReview(item, prepassMeta)      → OCR REVIEW (new)
  → needsExtractionConfirmation = OR of all flags
  → autoPersistUnmatchedInvoiceItems skipped when flagged
```

### What each layer catches

| Failure mode | Math gate | OCR anchor | OCR mismatch flag |
|--------------|:---------:|:----------:|:-----------------:|
| 1.05/10.88/13.44 | ✓ | ✓ (→1.35) | ✓ |
| 2.00/9.35/18.72 | ✗ | ✗ (total also wrong) | ✓ |
| 1.35/9.95/13.44 correct | ✗ | no-op | ✗ |
| Prosciutto 4.3/8.5/36.54 | ✗ | no-op | ✗ |

---

## T5 — Prompt hardening (minimal adjunct)

Insert after L125 (`FRACTIONAL QUANTITIES`) in `invoice-table-extraction.ts`. **Do not remove** L107–108 positive Gorgonzola example.

```
FRACTIONAL DIGIT GUARD (Emporio Qtd):
- 1,35 is 1.35 kg — NOT 1,05 (digit 3 vs 5) and NOT 2 (do not round 1,35 up).
- Read BOTH digits after the decimal separator before emitting quantity.

EMPORIO DISCOUNT MANDATORY:
- When Preço Total < Qtd × Preço Unit, Desc.(%) MUST be populated — never null on discounted rows.

NEGATIVE — Gorgonzola BAD:
- Qtd 1,05 + unit 10,88 + total 13,44 → WRONG (1,05×10,88≠13,44).
- Qtd 2,00 + total 13,44 → WRONG (visible Preço Total is 13,44; do not synthesize 2×unit).
```

**Rationale:** Reduces recurrence but **proven insufficient alone** (v28 failed with L107–108 present). Treat as ~12-line adjunct to anchoring, not primary fix.

### Prior design Rule F (bindMonetaryColumns)

Retain from `.tmp/gorgonzola-fix-design/` as **secondary** structured rebind:

When `gross_unit_price`, `discount_pct`, `line_total_net` all non-null:
verify `qty × gross × (1 − disc/100) ≈ line_total_net`; on fail, `unit_price = deriveNetUnitPrice`.

Does **not** fire when discount cols null (Gorgonzola actual failure) — hence prompt mandating Desc.(%) remains useful.

---

## T6 — Regression table

| Product | Invoice | Current (v28/v38) | After fix | Risk |
|---------|---------|-------------------|-----------|------|
| **Gorgonzola** | Emporio ab52796d | 1.05/10.88/13.44 or 2/9.35/18.72 | **1.35/9.96/13.44** (anchored) or REVIEW if total wrong | **Target** — fix intended |
| **Prosciutto** | Emporio ab52796d | 4.30/8.50/36.54 stable | 4.30/8.50/36.54 (no-op) | **None** — Δ=0% |
| **Mortadella** | Emporio ab52796d | 3.11/9.99/31.07 (v38) | 3.11/9.99/31.07 (no-op) | **Low** — v28 had discount omission, closed |
| **Bresaola** | Emporio ab52796d | 1.83/27.04/49.48 stable | 1.83/27.04/49.48 (no-op) | **None** |
| **Pellegrino** | Emporio ab52796d | 2/19.28/38.56 | 2/19.28/38.56 (no-op) | **None** — integer qty; excluded from anchor scope |
| **Ovo Líquido** | Aviludo | 6/10.19/61.14 | 6/10.19/61.14 (no-op) | **None** — integer qty |
| **Tomilho** | Bidfood | 1/2.06/2.06 | 1/2.06/2.06 (no-op) | **None** — MO unit, excluded |
| **Salada** | Bidfood | 4/2.19/8.76 | 4/2.19/8.76 (no-op) | **None** — EM unit, excluded |

---

## T7 — Before/after matrix (Gorgonzola + 3 deli controls)

| Product | PDF ground truth | Before (worst v30/v38) | After anchoring+validation | Control? |
|---------|------------------|------------------------|----------------------------|----------|
| **Gorgonzola** | 1.35 / €9.95 / €13.44 | 1.05/€10.88/€13.44 · 2/€9.35/€18.72 | **1.35 / €9.96 / €13.44** or REVIEW | Failure target |
| **Prosciutto** | 4.30 / €8.50 / €36.54 | 4.30 / €8.50 / €36.54 | 4.30 / €8.50 / €36.54 | ✓ Stable |
| **Mortadella** | 3.11 / €9.99 / €31.07 | 3.11 / €9.99 / €31.07 | 3.11 / €9.99 / €31.07 | ✓ Stable |
| **Bresaola** | 1.83 / €27.04 / €49.48 | 1.83 / €27.04 / €49.48 | 1.83 / €27.04 / €49.48 | ✓ Stable |

### Gorgonzola failure mode coverage

| Manifestation | Before | After |
|---------------|--------|-------|
| Qty 1.05 override | Silent persist €10.88/kg | Anchor → 1.35; math passes |
| Qty 2.00 + wrong total | Silent persist €9.35/kg | OCR mismatch REVIEW; blocks auto cost |
| Qty 2.00 + correct total 13.44 | Math REVIEW (15% var if price wrong) | Anchor → 1.35 |
| Discount cols null | bindMonetaryColumns pass-through | Rule F + prompt; anchor uses gross+disc if extracted |

---

## REQUIRED QUESTION — scope

### **B) Small OCR-vs-Pass-C family**

| Option | Assessment |
|--------|------------|
| A) Gorgonzola only | Too narrow — mechanism applies to any fractional Emporio kg row; hard to maintain name-specific rules |
| **B) Small OCR-vs-Pass-C family** | **Selected** — fractional kg + Emporio discount-table rows; stable controls excluded by scope gate |
| C) Broad robustness | Over-scoped — +1 GPT call and anchor logic on all invoices unjustified; MO/pack rows add risk |

---

## FINAL VERDICT

### **D) OCR anchoring + validation**

| Verdict | Rationale |
|---------|-----------|
| A) Prompt only | ❌ Proven insufficient (L107–108 example; v28/v38 failures) |
| B) OCR anchoring only | ⚠️ Fixes qty override but misses self-consistent 2/9.35/18.72 |
| C) Validation only | ⚠️ Already implemented; misses math-consistent hallucinations |
| **D) OCR anchoring + validation** | **✅ Smallest safe fix for stated goal** |
| E) Other | Defer full dual-schema parallel pass |

### Implementation scope (out of scope for this design)

| File | Change |
|------|--------|
| `supabase/functions/extract-invoice/invoice-qty-prepass.ts` | **NEW** — qty pre-pass schema + GPT call |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | `anchorQuantities` hook; prompt adjunct ~12 lines |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | Rule F structured rebind (from prior design) |
| `src/lib/invoice-extraction-review.ts` | `OCR_QTY_MISMATCH` reason (extend existing module) |
| `src/routes/invoices.tsx` | Wire OCR mismatch into `needsExtractionConfirmation` |
| Tests | Anchor scenarios 1–3; control no-ops; regression table replay |

**Estimated diff:** ~100–120 lines. +1 GPT call per extraction. No schema migration.

---

## Integration with prior design

| Prior (gorgonzola-fix-design) | This hardening design |
|-------------------------------|----------------------|
| Verdict C: Prompt + validation | Verdict **D**: OCR anchoring + validation |
| `needsMathConfirmation` new | **Already implemented** as `needsMathematicalReconciliationReview` |
| Rule F in bindMonetaryColumns | **Retained** as secondary |
| Prompt delta ~12 lines | **Retained** as adjunct |
| No OCR infrastructure | **Adds qty pre-pass** — core differentiator |

---

## Artifact index

- `.tmp/gorgonzola-fix-design/` — prior prompt + validation design
- `.tmp/gorgonzola-vs-prosciutto-differential-audit/` — OCR correct, Pass C diverges
- `.tmp/reread-pipeline-forensics-audit/` — v38 2/9.35/18.72 fresh hallucination
- `.tmp/emporio-deli-stability-audit/` — Gorgonzola 60% stability; controls 90–100%
- `.tmp/gorgonzola-structured-extraction-failure-audit/` — first wrong value at Pass C
- `.tmp/mathematical-consistency-coverage-audit/` — 52-row corpus; Gorgonzola sole CRITICAL
- `.tmp/persistence-audit/pass-c-raw/` — OCR-era 1.35 qty evidence
- `supabase/functions/extract-invoice/index.ts` — 4-pass vision pipeline
- `supabase/functions/extract-invoice/invoice-table-extraction.ts` — Hybrid H Pass C
- `supabase/functions/extract-invoice/invoice-monetary-binding.ts` — bindMonetaryColumns
- `src/lib/invoice-extraction-review.ts` — math reconciliation guard (implemented)
- `src/routes/invoices.tsx` — needsExtractionConfirmation wiring

Machine-readable: `design.json`
