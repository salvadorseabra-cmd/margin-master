# OCR Quantity Prepass Deterministic Column Reading Fix — Design

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Mode:** STRICT DESIGN ONLY · 2026-06-24

## Executive summary

Qty pre-pass on v39 returns **integer 2** for Gorgonzola (PDF Qtd **1,35**) and Bresaola (PDF **1,83**) while Prosciutto reads **4,30** correctly from the **same table crop**. Fraction-row crop audit proves Qtd cells are visible and legible; GPT ignores existing prompt rules and infers quantity from description fractions (`1/8`, `1/2`). Anchoring cannot recover because integer OCR fails `isFractionalQty` scope gate.

**Recommended fix:** **Deterministic Qtd-column strip crop** before prepass vision call, plus **narrow validation** widening `ocr_qty_mismatch` when fraction-description heuristics fire. Prompt-only is insufficient (rules already present, violated on live probe).

---

## Required question (exactly one)

**B) Fraction-description family**

Failures cluster on Emporio deli rows whose Designação contains pack-fraction notation (`1/8`, `1/2`). Prosciutto (no fraction token) and Mortadella (fraction present but prepass ≈ correct) show the bug is not universal crop failure nor Gorgonzola-only. Scope: fraction-description confusion class on Emporio dense tables — not general multi-supplier OCR robustness (Pellegrino `x15` bleed is a separate metadata class).

---

## Final verdict (exactly one)

**D) Deterministic Qtd + validation**

| Option | Verdict |
|--------|---------|
| A Prompt only | **REJECT** — v39 prompt already forbids `1/8`; live prepass still returns 2 |
| B Deterministic Qtd only | **PARTIAL** — fixes root cause; leaves scope-gate blind spot on bad integer OCR |
| C Prompt + validation | **REJECT** — validation cannot correct prepass; integer OCR never enters anchor scope |
| D Deterministic Qtd + validation | **SELECT** — column isolation fixes prepass; validation catches residual disagreements |
| E Other | Defer full second GPT pass or row-re-extract |

---

## T1 — `runQuantityPrePass` architecture trace

### Pipeline position

```
extractTableItemsFromImage (invoice-table-extraction.ts:337)
  └─ runTableExtractionPass (L378)
       ├─ cropTableRegionForLineItems (invoice-image-crop.ts:393)
       │    └─ detectTableBounds → crop(0, top, width, bottom-top) → croppedDataUrl
       ├─ runQuantityPrePass(croppedDataUrl, apiKey)     ← FIX TARGET
       ├─ callOpenAiJson Pass C (TABLE_EXTRACTION_SYSTEM_PROMPT)
       ├─ parseMonetaryLineItems
       ├─ anchorQuantities(prepassRows, parsedItems)     ← consumes prepass output
       ├─ bindMonetaryColumns → reconcileLineItemAmounts
       └─ attach extraction_meta per item
```

### Prepass internals (`invoice-qty-prepass.ts`)

| Stage | Detail |
|-------|--------|
| **Model** | `gpt-4.1` via `callOpenAiJson` (`invoice-date-extraction.ts:49-52`) |
| **Sampling** | `temperature=0`, `seed=42` |
| **Response format** | Strict JSON schema `invoice_qty_prepass` — `items[{name, quantity, unit}]` |
| **System prompt** | `QTY_PREPAS_SYSTEM_PROMPT` L35-48 — Qtd-only, ignore `1/8`, `~1,5kg`, etc. |
| **User message** | Text: "Copy quantity and unit from the Qtd column…" + **full table crop image** |
| **Parse** | L190-198 — pass-through `quantity` if `typeof === "number"`, else `null`; no sanitization |
| **Downstream** | `anchorQuantities` matches by index then name key; scope gate `isQtyAnchorScopeRow` requires fractional kg + discount semantics |

### `anchorQuantities` input contract

- **Input:** `prepassRows[]` from vision JSON + `structuredRows[]` from Pass C
- **Scope gate:** `unit === "kg"` AND `isFractionalQty(ocrQty)` AND Emporio discount semantics
- **Anchor when:** OCR line-total score beats Pass C by €0.10, or math fails + OCR score ≤ €0.50
- **Flag:** `ocr_qty_mismatch` when Δ > 10% and anchor declined — **only inside scope gate**
- **Blind spot:** Integer prepass (e.g. 2) → scope false → `ocr_qty_mismatch: false` even at 47.5% delta (ocr-anchoring-decision audit)

### Crop geometry (Emporio May 2026, 724×1124)

| Field | Value |
|-------|-------|
| Table bounds | top **430**, bottom **851**, height **421px** |
| Qtd column | x **438–478** (40px), right-aligned decimals |
| Header "Qtd." | Clipped above crop top — values still legible in strips |
| Fail-open | `bounds.detected=false` → full image unchanged |

---

## T2 — Design options evaluation

| Option | Effectiveness | Complexity | Blast radius | Risk | Notes |
|--------|---------------|------------|--------------|------|-------|
| **A Prompt only** | LOW | ~8 lines prompt | Minimal | HIGH residual | Already deployed; violated on Gorgonzola/Bresaola |
| **B Deterministic Qtd** | HIGH on fraction rows | ~60–80 lines + crop helper | Emporio table layouts initially | LOW on controls | Removes description from vision input |
| **C Prompt + validation** | LOW fix / PARTIAL detect | ~25 lines | Review flags only | Misses Gorgonzola anchor path | Validation cannot supply correct OCR qty |
| **D Qtd + validation** | HIGH | ~90–110 lines | Emporio prepass + metadata | LOW | Recommended smallest **safe** end-to-end fix |
| **E Other** | Variable | High | Wide | Medium | Row re-extract on math fail; dual full-schema pass — defer |

---

## T3 — Deterministic Qtd-column reading design

### Principle

**Read ONLY the Qtd column pixels.** Never send Designação text to the qty prepass model. Return `quantity: null` when the cell is illegible — do not guess from description, fractions, or pack weights.

### Approach: vertical Qtd strip crop

Smallest change: after `cropTableRegionForLineItems`, crop a **narrow vertical strip** at the Qtd x-range before `runQuantityPrePass`.

```
full image → table crop (existing) → qtd strip crop (NEW) → GPT qty prepass
```

**Emporio calibration** (from fraction-row-crop audit, 724px width):

| Column | x0 | x1 |
|--------|----|----|
| Designação | 108 | 392 |
| **Qtd** | **438** | **478** |
| Preço Unit | 478 | 548 |

Use width-normalized fractions (`x0 ≈ 0.605`, `x1 ≈ 0.660`) so resize-tolerant.

### Row alignment

Keep **index-order** matching (current `matchPrepassRow` index-first). Qtd strip preserves row count and vertical order; `name` field becomes optional in strip mode (match by index only). If row count mismatches Pass C, unmatched rows get `quantity: null`.

### Fail-open ladder

1. Qtd strip crop succeeds → strip-only prompt + strip image
2. Strip too narrow / empty → fall back to full table crop + hardened prompt (T4)
3. Prepass returns null for a row → anchoring skips; Pass C qty retained; math review may flag

### Future generalization (out of scope for v1)

- Detect "Qtd" / "QUANT" header x-position via luminance scan in header band
- Supplier profiles in `invoice-crop-geometry.ts` (Emporio, Bidfood, Aviludo)
- Per-row cell crops if strip OCR confuses adjacent rows

### Pseudocode

See `design.json` → `task3_deterministicQtdDesign.pseudocode`.

---

## T4 — Prompt hardening (minimal adjunct)

Apply **only when strip crop unavailable** (fallback path). Do not rely on these lines alone.

**Add to `QTY_PREPAS_SYSTEM_PROMPT`:**

```
- The image may show ONLY the quantity column — no product names are visible.
- Each horizontal band is one row's Qtd cell. Read top-to-bottom in table order.
- Pack fractions in product names (1/8, 1/2, 1/4) are NEVER purchased quantity.
- If a cell is blank or illegible → quantity: null (never infer 1, 2, or pack count).
- Integer 2 is almost never a valid Emporio kg Qtd when the cell shows a decimal like 1,35.
```

**User message when strip mode:**

```
Read the decimal quantity from each row band in this Qtd column image only.
Return one item per visible row band, in order. Name may be "row-N".
```

---

## T5 — `OCR_QTY_REVIEW` / validation safety

### Current behavior

- `needsOcrQtyMismatchReview` (`invoice-extraction-review.ts:136`) trusts `extraction_meta.ocr_qty_mismatch`
- Flag set only inside `anchorQuantities` scoped branches when anchor declined and Δ > 10%
- **Scope-fail** (integer OCR on Gorgonzola) → `ocr_qty_mismatch: false` → **no OCR review** despite 47.5% delta

### Proposed adjunct: fraction-description conflict heuristic

**Safe as detection-only** — never auto-overwrite qty from heuristic.

```
IF structured.name matches /\d+\s*\/\s*\d+/
AND prepass.quantity is integer
AND passC.quantity is fractional kg
AND delta(prepass, passC) > 10%
THEN set ocr_qty_mismatch = true (or ocr_qty_source_conflict)
```

| Scenario | Safe? | Why |
|----------|-------|-----|
| Gorgonzola prepass=2, Pass C=1.05 | YES flag | User review; no silent wrong anchor |
| Mortadella prepass=3.1, Pass C=3.11 | NO flag | Δ < 10%, integers N/A |
| Prosciutto agreement | NO flag | No conflict |
| Pellegrino prepass=11, Pass C=2 | YES flag (separate class) | x15 metadata bleed — review warranted |

### Validation alone without deterministic Qtd?

**NOT safe as primary fix.** It surfaces Gorgonzola for review but does not supply correct `ocr_quantity` for anchoring. User still sees wrong persisted qty until manual edit. Deterministic Qtd must come first.

### After deterministic Qtd fix

Existing `OCR_QUANTITY_MISMATCH` review remains valid safety net for Pass C vs column-read disagreements (S3 scenario). No new reason code required for v1.

---

## T6 — Regression table (9 products)

Emporio May 2026 live probe (v39) for in-invoice rows; Bidfood MO rows from VL corpus as non-Emporio controls.

| Product | PDF / persisted qty | Prepass OCR (v39) | Pass C | Fraction / metadata in name | Prepass OK? | Expected after fix |
|---------|---------------------|-------------------|--------|----------------------------|-------------|-------------------|
| **Gorgonzola** | 1.35 | **2** | 1.05 | `1/8`, `~1,5kg` | NO | prepass **1.35** → anchor **1.35** |
| **Bresaola** | 1.83 | **2** | 1.83 | `1/2`, `1,5kg` | NO | prepass **1.83** → keep **1.83** |
| **Prosciutto** | 4.30 | 4.30 | 4.30 | `~4,25KG` only | YES | unchanged **4.30** |
| **Mortadella** | 3.11 | 3.10 | 3.11 | `1/2`, `3,5kg` | ~YES | **3.11** (rounding) |
| **Pellegrino** | 2.00 | **11** | 2.00 | `75cl x 15ud` | NO | strip may fix → **2**; else heuristic flag |
| **Paccheri** | 24 | 24 | 24 | `500g` pack | YES | unchanged **24** |
| **Ovo** | 6 (Bidfood VL) | n/a | n/a | liquid egg 1kg | control | no change — different supplier layout |
| **Tomilho** | 1 MO (Bidfood) | n/a | n/a | herb bunch | control | no change |
| **Salada** | 1 EM (Bidfood) | n/a | n/a | `250g` embedded | control | no change |

**Regression gate:** Re-extract Emporio May 2026; Gorgonzola + Bresaola prepass must match PDF Qtd; Prosciutto/Mortadella/Paccheri unchanged; Pellegrino improved or flagged.

---

## T7 — Before / after matrix (4 deli products)

Assumes **D) Deterministic Qtd strip + existing anchoring (v39)** on Emporio May 2026 re-extract.

| Product | PDF Qtd | Before: prepass | Before: Pass C | Before: final | Before: anchored? | After: prepass | After: Pass C | After: final | After: anchored? |
|---------|---------|-----------------|----------------|---------------|-------------------|----------------|---------------|--------------|------------------|
| Gorgonzola | 1.35 | 2 | 1.05 | 1.05 | false | **1.35** | 1.05 | **1.35** | **true** |
| Bresaola | 1.83 | 2 | 1.83 | 1.83 | false | **1.83** | 1.83 | **1.83** | false (agree) |
| Prosciutto | 4.30 | 4.30 | 4.30 | 4.30 | false | 4.30 | 4.30 | 4.30 | false |
| Mortadella | 3.11 | 3.10 | 3.11 | 3.11 | false | **3.11** | 3.11 | 3.11 | false |

**Gorgonzola math review:** Before FLAG (1.05×9.95≠13.44); After PASS (1.35×9.95≈13.43).

---

## Implementation sketch (no code in this audit)

| File | Change |
|------|--------|
| `invoice-image-crop.ts` or new `invoice-qty-column-crop.ts` | `cropQtdColumnStrip(tableCropDataUrl, bounds?)` |
| `invoice-crop-geometry.ts` | `EMPORIO_QTD_COLUMN_X_FRAC` constants |
| `invoice-qty-prepass.ts` | Accept strip URL; strip-specific prompt; fraction-conflict metadata helper |
| `invoice-table-extraction.ts` | Pass `tableCrop.bounds` into prepass; log strip vs fallback |
| `invoice-qty-prepass.test.ts` | Strip-mode fixture; Gorgonzola prepass=1.35 integration |
| `invoice-extraction-review.ts` | Optional: expose fraction-conflict in meta (adjunct) |

**Blast radius:** +0 GPT calls; same single prepass call with narrower image. Emporio-scoped column fractions; fail-open to current behavior.

**Tests:** Re-run fraction-row-crop audit strips as golden inputs; live VL re-extract on `ab52796d-…`.

---

## Evidence chain

| Audit | Conclusion used |
|-------|-----------------|
| `.tmp/fraction-row-crop-audit/` | Qtd visible; Goal B selected; x=438–478 |
| `.tmp/ocr-prepass-forensics-audit/` | 2.00 first at prepass GPT; prompt violated |
| `.tmp/ocr-anchoring-decision-audit/` | Scope gate blocks integer OCR; no mismatch flag |
| `.tmp/gorgonzola-hardening-implementation/` | Anchoring correct when OCR=1.35; upstream prepass is bottleneck |

---

## Artifacts

- `design.json` — machine-readable design + pseudocode
- This report
