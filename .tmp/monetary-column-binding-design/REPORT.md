# Monetary Column Binding Hardening — Implementation Design

Generated: 2026-06-11  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY design** — no code changes, no commits.

---

## Executive Summary

**Preferred architecture:** **H — Hybrid: Header-Anchored Crop + Structured Monetary Binding + Validator Gate**  
**Confidence:** **74%** for eliminating the stable column-shift residual (~€21.4 on Emporio Prosciutto + Bocconcino Pomodor); **68%** for durable protection at 1,000+ restaurant invoice scale.

All other extraction families (Geometry, Footer, Hallucinations, Persistence, Reconcile) are solved. The remaining **structural** family is **Pass C monetary column binding** on dense discounted tables — GPT reads the wrong numeric column for `unit_price` while often reading `total` correctly. A **separate** family (Mammafiore discount-line GPT variance, ~€54.78 run-to-run) must not be conflated with this design.

This design combines three deterministic layers with one bounded GPT extension:

1. **Geometry:** Always include the table header row in the Pass C crop (fixes Emporio header clipping).
2. **Structured monetary binding:** Expand Pass C output (or add Pass C²) to return column-labeled fields (`gross_unit_price`, `discount_pct`, `line_total_net`) instead of a single ambiguous `unit_price` triple.
3. **Validator gate:** Apply Rule **B** (unit ≈ discount %) and Rule **E** (neighbour inconsistency) with discount-line exemptions; trigger **targeted row-level retry** only on flagged rows.

**Why this should be the final extraction-family fix:** It addresses the proven root causes from five audits — header visibility, missing column metadata in the GPT triple, and vision-model column proximity errors — without relying on prompt luck, full-invoice retries, or arithmetic rules that false-positive on legitimate discount lines.

**Return summary**

| Field | Value |
|-------|-------|
| Preferred architecture | **H — Hybrid** |
| Confidence | **74%** |
| Key risk highlights | R1 self-consistent triples; R2 Rule A alone unusable; R4 Bocconcino needs binding not just headers |
| Stable residual targeted | ~€21.4 (Prosciutto ~€1.4 + Pomodor ~€10) |

---

## Row-Level Audit Evidence

### Emporio Italia — Prosciutto Cotto

| Source | Qty | Unit € | Total € | Column source |
|--------|-----|--------|---------|---------------|
| Visible invoice | 4.30 | 10.30 (gross) / 8.17 (net) | **36.54** | Preço Unit / Preço Total |
| Discount column | — | **17.50** (no % symbol) | — | Desc.(%) |
| VL refined (stable error) | 4 | **9.17** | **36.54** | Derived; arithmetically closed |
| Worst 5-run shift | 4.3 | **17.00** | 36.54 | Desc.(%) bleed |

- Pass C crop **clips headers** (geometry top y≈456; headers at y≈430).
- Total column read correctly **4/5 runs**; unit shifts among gross, net, and discount %.
- **Undetectable by validator alone:** refined run €9.17 × 4 ≈ €36.54 — passes all arithmetic rules.
- **Detectable:** run 3 unit €17 ≈ Desc.(%) 17.50 — Rule **B** (0 FP).

### Bocconcino — POMODORI PELATI

| Source | Qty | Unit € | Total € | Column source |
|--------|-----|--------|---------|---------------|
| Visible invoice | 1.000 | 27.560 | **22.05** | P.VENDA S/IVA / VALOR LÍQUIDO |
| Discount column | — | **20.00%** | — | DESC |
| VL refined (stable error) | 2 | **20.00** | **40.00** | DESC as unit; 2×20 calculated |
| Neighbour bleed | — | **27.56** | 54.20 | Mezzi Paccheri row above |

- Crop is **NOT ambiguous** — headers, EUR, and % visible; GPT still misreads.
- **Never** reads VALOR LÍQUIDO 22.05 in 5-run stability test.
- **Detectable:** unit €20 = DESC 20% — Rule **B**; €27.56 neighbour — Rule **E**.
- **Undetectable:** run 2 €27.56 / €54.20 within tolerance without neighbour context.

### Separate family (out of scope for H)

Mammafiore Guanciale/Birra/Farina: **discount-line GPT variance** (correct on one commit run, wrong on next) — 80% run consistency, not column-shift. Fixing column binding does not resolve this; do not apply qty×unit=total enforcement globally.

---

## Task 1 — Solution Architectures (9 options)

| ID | Architecture | One-line description |
|----|--------------|----------------------|
| **A** | Prompt-only | More rules/examples in `TABLE_EXTRACTION_SYSTEM_PROMPT` |
| **B** | Post-Pass-C validator only | Deterministic rules on GPT triple; flag/reject |
| **C** | Geometry header crop only | Include header row in table crop bounds |
| **D** | Dedicated monetary GPT pass | Pass C² returns column-labeled numerics |
| **E** | OCR-first column extraction | Slice/OCR columns; GPT for names only |
| **F** | Retry / multi-run voting | 3–5× Pass C; modal or consensus pick |
| **G** | Expanded Pass C schema | Single pass; emit gross/discount/net fields |
| **H** | **Hybrid (preferred)** | C + G/D + B with targeted row retry |
| **I** | Supplier template registry | Hard-coded column maps per supplier layout |

---

## Task 2 — Option Comparison

| Option | Accuracy Δ | Complexity | FP Risk | Maintenance | 1,000+ invoices |
|--------|------------|------------|---------|-------------|-----------------|
| **A** Prompt-only | 5–15% | Low | Low | Medium (prompt drift) | **Poor** — variance persists |
| **B** Validator only | Detect 75%, fix 0% | Low–Med | **High** (Rule A 37.5% FP) | Low | **Partial** — safety net |
| **C** Header crop only | 20–35% (Emporio) | Low | Low | Low | **Good** for clipped headers; insufficient alone |
| **D** Pass C² monetary | 50–70% | Medium | Low–Med | Medium | **Good** — +1 GPT call/invoice |
| **E** OCR-first | 40–60% | **High** | Medium | **High** | **Uncertain** — layout diversity |
| **F** Multi-run retry | 15–30% | Low | Medium | Low | **Poor** — 3–5× cost, wrong consensus |
| **G** Expanded schema | 45–65% | Medium | Low–Med | Medium | **Good** — one pass + binder |
| **H** **Hybrid** | **70–85%** | Med–High | **Low** | Medium | **Excellent** |
| **I** Template registry | 60–80% per template | High | Medium | **Very High** | **Poor** — unbounded templates |

Full numeric rationale: `option-comparison.json`.

---

## Task 3 — Preferred Architecture (H) — Detailed Design

### Phase 1: Header-anchored table crop (Geometry hardening)

**Problem:** Emporio Pass C crop starts below the header row; quantity/unit/discount/total column labels are invisible. Discount column shows `17,50` without `%` — visually identical to a euro amount.

**Change (conceptual):**
- In `detectTableBounds` / `cropTableRegionForLineItems`, ensure `bounds.top ≤ headerTop` (extend `TABLE_TOP_MARGIN` or add `HEADER_INCLUDE_ROWS` when white-header detection finds band above current crop top).
- Validate against existing VL fixtures: Bidfood, Aviludo May, Emporio, Bocconcino — no footer bleed, no over-crop of totals band.

**Expected impact:** Emporio Prosciutto moves from **MARGINAL** to **YES** human-readability per column-selection deep dive. Does **not** alone fix Bocconcino (headers already visible).

### Phase 2: Structured monetary binding (Pass C schema expansion or Pass C²)

**Problem:** Validator only sees `{quantity, unit_price, total}` — cannot tell whether `unit_price` came from Preço Unit, Desc.(%), or P.VENDA.

**Change (conceptual):** Extend GPT JSON schema:

```json
{
  "items": [{
    "name": "...",
    "quantity": 4.3,
    "unit": "kg",
    "gross_unit_price": 10.30,
    "discount_pct": 17.50,
    "line_total_net": 36.54,
    "unit_price": null,
    "total": null
  }]
}
```

Prompt additions:
- Copy each monetary column to its **named field** using visible header text.
- `discount_pct` only from % column; never assign to `gross_unit_price`.
- `line_total_net` only from rightmost EUR total column (VALOR / Preço Total).
- Derive `unit_price` in code: prefer net unit from gross×(1−discount/100) when both present; else gross; never discount %.

**Alternative:** Separate `extractMonetaryColumnsFromImage()` (Pass C²) on same crop if single-pass schema confuses row extraction quality. Prefer **single expanded schema** if VL regression shows no row-count regression; else split.

**Expected impact on target rows:**
- **Pomodor:** `discount_pct: 20` bound to DESC; binder rejects `unit_price = 20` (Rule B).
- **Prosciutto:** `gross_unit_price: 10.30`, `discount_pct: 17.50`, `line_total_net: 36.54` — binder computes net ~8.49–8.51 range; avoids €17 and €9.17 self-consistent wrong triple.

### Phase 3: Deterministic validator gate (`bindMonetaryColumns`)

**Rules (ordered, from validation audit):**

| Priority | Rule | Action | FP rate |
|----------|------|--------|---------|
| 1 | **B** — `unit_price ≈ discount_pct` (±0.5) | Reject unit; rebind from gross/net | **0%** |
| 2 | **E** — unit matches adjacent row's list price, qty×unit≠total | Flag row | **0%** |
| 3 | **D** — unit > total/qty × 1.15 when discount present | Rebind to net | 31% without exemption |
| 4 | **A** — qty×unit≈total | **Only if discount_pct is null** | 37.5% if unscoped |

**Discount-line exemption:** If `discount_pct` populated OR `gross_unit_price × qty ≠ line_total_net` by >2%, skip Rule A. Preserves Mammafiore-style legitimate discount rows.

**Output:** `binding_confidence: high | flagged | failed` per row.

### Phase 4: Targeted row-level retry (bounded)

- On `flagged` only: crop single row band (evidence: `emporio-prosciutto-row-crop.png`, `bocconcino-pomodor-row-crop.png`) with header strip attached.
- Narrow prompt: "Return only gross_unit_price, discount_pct, line_total_net for this row."
- **One retry max** per row — not 5× full invoice.
- If still `failed`: return best binder output + `validation_warning` (same pattern as footer pass).

### Pipeline position

```
imageDataUrl
  → cropTableRegionForLineItems (Phase 1 headers)
  → extractTableItemsFromImage / expanded schema (Phase 2)
  → bindMonetaryColumns + validator gate (Phase 3)
  → [optional] row retry (Phase 4)
  → reconcileLineItemAmounts (preserve discounted totals)
  → finalizeExtractedLineItems (net subtotal reconcile — unchanged)
```

---

## Task 4 — Why H Beats Alternatives

### vs more prompt engineering (A)

- `TABLE_EXTRACTION_SYSTEM_PROMPT` already has **COLUMN-FAITHFUL EXTRACTION** as highest priority, discounted-line rules, and Pomodor example — yet 5-run stability shows **persistent column shifts** (Prosciutto €17 from Desc.(%); Pomodor €20 from DESC).
- Bocconcino crop is **unambiguous to humans**; failures are **vision model limitation**, not missing instructions.
- Negative example for POMODOR uses qty=2/€25/€50 — **mismatches visible row** (qty=1, €27.56, €22.05), potentially reinforcing wrong binding.

### vs more retries (F)

- Column-shift audit: **5 runs ≠ deterministic** — Prosciutto run 4 is correct (€8.17) but not modal; Pomodor run 1 is **stable wrong** (€20/€40).
- **25% of errors are arithmetically self-consistent** — retrying the same crop+prompt reproduces the same wrong closed triple (refined Prosciutto 4×€9.17≈€36.54).
- Cost: 5× full invoice GPT on 1,000+ restaurants is unsustainable without improving input structure.

### vs more GPT runs without structure (D alone, F)

- Same model on same ambiguous triple **does not add column metadata** — validator cannot distinguish correct discount lines from column shift without `discount_pct` in output.
- Pass C² **with structured schema** adds information; blind re-runs do not.

### vs validator only (B)

- Detects **75%** of historical error runs but **fixes 0%** automatically.
- Rule A alone: **37.5% false positive** on correct discount rows — would corrupt Mozzarella, De Cecco, Bidfood produce.
- Blocker: "Validator only sees GPT output triple — not which column was read" (`feasibility.json`).

### vs geometry only (C)

- Necessary but **insufficient** — Bocconcino already has headers in crop; GPT still selects DESC as unit_price.

---

## Risk Matrix

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| **R1** | Self-consistent wrong triples | High | Structured schema + Rule B |
| **R2** | Rule A FP on discount lines | High | Never use A alone; discount exemption |
| **R3** | Header crop regression | Medium | Fixture regression on Bidfood/Aviludo |
| **R4** | GPT mis-bind despite headers | High | Binder + row retry |
| **R5** | Conflate Mammafiore variance | Medium | Separate code paths; preserve reconcile |
| **R6** | Latency/cost | Low | Row retry ≤10% rows, 1× max |
| **R7** | GT vs visible total drift | Low | Bind to visible Preço Total |
| **R8** | Neighbour-row bleed | Medium | Rule E + row-scoped retry |

Full matrix: `risk-matrix.json`.

---

## Confidence Level

| Claim | Confidence |
|-------|------------|
| H eliminates stable €21.4 column-shift residual | **74%** |
| H durable at 1,000+ invoices without per-supplier templates | **68%** |
| Validator-only (B) sufficient alone | **25%** |
| Prompt-only (A) sufficient alone | **15%** |
| This is the **final structural extraction-family** fix | **70%** — discount-line variance remains separate |

**Residual uncertainty:** GPT may still mis-populate structured fields on novel layouts; row retry and `validation_warning` bound uncaught errors.

---

## Why This Should Be the Final Extraction-Family Fix

1. **First divergence is Pass C only** — all downstream stages (normalize, reconcile, DB, UI) are clean per persistence-audit and root-cause consolidation.
2. **Failure mechanism is identified** — column proximity + missing header context (Emporio) + model treats % as € (both products); not geometry, footer, or persistence.
3. **Validation audit proves the fix shape** — detection requires **column metadata** (Rule B, 0 FP); arithmetic alone cannot close the class.
4. **Discount-line variance is orthogonal** — separate family; global qty×unit=total enforcement would **increase** error on Mammafiore.
5. **Scales without template registry** — header geometry + schema + rules generalize across Portuguese restaurant layouts with discount columns.

After H ships, remaining extraction risk is primarily **GPT run variance on discount totals** (Mammafiore), addressable by a smaller, separate "copy VALOR not qty×price" hardening — not column binding.

---

## Task 5 — Files / Functions Likely Affected

### Edge function — `supabase/functions/extract-invoice/`

| File | Functions / symbols | Role in H |
|------|---------------------|-----------|
| `index.ts` | `serve` handler, stage 2d/6c wiring | Wire binder, warnings, optional row retry |
| `invoice-image-crop.ts` | `detectTableBounds`, `cropTableRegionForLineItems`, `detectGreyHeaderTop`, `detectWhiteHeaderTop` | Phase 1 header inclusion |
| `invoice-crop-geometry.ts` | `TABLE_TOP_MARGIN`, `HEADER_BAND_ROWS`, `EMPORIO_*` constants | Tune header margin per layout class |
| `invoice-table-extraction.ts` | `TABLE_EXTRACTION_SYSTEM_PROMPT`, `extractTableItemsFromImage`, `normalizeItems`, `finalizeExtractedLineItems` | Phase 2 schema + prompt; normalize new fields |
| `invoice-line-reconcile.ts` | `reconcileLineItemAmounts`, `reconcileLineItemsToNetSubtotal` | **Careful:** preserve discounted qty×unit≠total; binder runs **before** reconcile |
| `invoice-date-extraction.ts` | `callOpenAiJson` | Shared OpenAI JSON caller for row retry |
| **NEW** `invoice-monetary-binding.ts` | `bindMonetaryColumns`, `validateMonetaryBinding`, `deriveUnitPrice` | Phase 3 deterministic binder + gate |
| **NEW** `invoice-row-crop.ts` (optional) | `cropSingleTableRow` | Phase 4 targeted retry crops |

### Tests

| File | Notes |
|------|-------|
| `invoice-image-crop.test.ts` | Header inclusion regression |
| **NEW** `invoice-monetary-binding.test.ts` | Rule B/E on Prosciutto/Pomodor fixtures |
| `.tmp/column-shift-audit/run-audit.mts` | Reuse as validation harness post-implementation |

### Client (likely unchanged)

| File | Notes |
|------|-------|
| `src/routes/invoices.tsx` | Invokes `extract-invoice`; may surface `validation_warning` if added |
| `src/lib/invoice-item-fields.ts` | `normalizeInvoiceNumberField` — no schema change if edge function maps to `unit_price`/`total` |

### Out of scope

- `parseContinente.ts`, `parsePadaria.ts`, `stages.ts` — not invoked in vision four-pass mode (`index.ts` log line 67).
- Footer passes — solved; no changes needed for column binding.

---

## Projected Outcomes (if H implemented)

| Metric | Baseline (refined VL) | Projected post-H |
|--------|----------------------|------------------|
| Field accuracy | 91.8% | ~94–95% |
| Stable column-shift € | ~21.4 | ~3–6 (residual edge cases) |
| Financial error € | 66.34 (incl. Mammafiore variance) | ~45–50 without discount-variance fix |
| Validator detection | 75% (no auto-fix) | ~90%+ with structured fields + gate |

---

## Supporting Artifacts

- `option-comparison.json` — per-architecture estimates
- `risk-matrix.json` — risk IDs, mitigations, audit cross-refs
- Reference audits: `.tmp/column-selection-deep-dive/`, `.tmp/monetary-column-validation-audit/`, `.tmp/column-shift-audit/`, `.tmp/root-cause-consolidation/`, `.tmp/discount-line-audit/`, `.tmp/passc-refinement-validation/`

---

## Implementation Checklist (for future PR — not executed here)

1. [ ] Extend table crop to include headers; snapshot VL crop bounds before/after
2. [ ] Expand Pass C JSON schema + prompt for column-labeled monetary fields
3. [ ] Implement `bindMonetaryColumns` with Rule B/E and discount exemption
4. [ ] Add row-level retry path for `flagged` rows only
5. [ ] Regression: Prosciutto, Pomodor, Bidfood, Aviludo May, Mammafiore discount lines (no FP)
6. [ ] Re-run `column-shift-audit/run-audit.mts` and `monetary-column-validation-audit/run-audit.mts`
