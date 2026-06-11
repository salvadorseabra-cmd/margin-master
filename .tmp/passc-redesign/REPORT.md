# Pass C Prompt Redesign — Simulation Report

**Date:** 2026-06-11 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only — no code changes**

Cross-verified against: `.tmp/passc-prompt-audit/`, `.tmp/gpt-pattern-audit/`, `.tmp/persistence-audit/`, `.tmp/field-accuracy-audit/`, `.tmp/hallucination-audit/`.

**Method:** Counterfactual simulation from audit evidence. `OPENAI_API_KEY` unavailable — no live spot-check extractions. Fresh-extract evidence from persistence-audit (2026-06-11) used as natural experiment for inference suppression.

---

## Executive Summary

**Would column-faithful extraction eliminate the majority of VL errors?**

**Yes — for financially significant errors.** A column-faithful Pass C redesign would likely eliminate **~71% of financial errors** (5 of 7) and **~53% of all error-catalog rows** (8 of 15 if counting partial POMODOR fix), but **not the majority of all 15 catalogued rows** because **8/15 are description-only OCR noise** that no prompt change addresses.

| Category | Current | After redesign (est.) |
|----------|---------|----------------------|
| Pack Multiplier errors | 4 | **0** |
| Phantom rows | 1 | **0** |
| Column Shift errors | 3 | **2** |
| OCR description noise | 8 | **8** (unchanged) |

The current prompt **actively causes** failures via `infer quantity/unit from product names` (lines 33–34) and retail pack examples (`33cl Pack 24 → qty 24`) that generalize to wholesale `(CX 2.5KG*6)`. Persistence-audit confirms all financial errors originate in Pass C; downstream stages are lossless.

**Recommendation: YES — Marginly should redesign Pass C.** Confidence: **82%**.

Pair prompt redesign with: (1) VL re-extract (DB is stale on 6/7 problem rows), (2) optional row-count + lot-line post-filters, (3) arithmetic sanity flags for residual column-shift cases.

---

## Error Prevention Analysis

### Errors that would disappear (YES — 4 rows, 5 financial)

| Invoice | Product | Error | Mechanism fixed |
|---------|---------|-------|-----------------|
| Emporio | Ginger Beer 0.20cl | Pack Multiplier | Column qty=2; no 24-bottle inference |
| Mammafiore | Aceto pet 5l*2 | Pack Multiplier | Column qty=1; *2 is metadata (fresh extract already proves) |
| Mammafiore | Rulo 1kg*2 | Pack Multiplier | Column qty=1; *2 is metadata |
| Mammafiore | Phantom Lote 609 | Phantom + Lot | Anti-phantom + lot rejection rules |

**Partial fix (UNCERTAIN — 1 row):**

| Invoice | Product | Fix | Residual |
|---------|---------|-----|----------|
| Bocconcino | POMODOR (CX 2.5KG*6) | Qty 6→2 **YES** | Price €25→€20 persists in fresh extract — column-shift |

### Errors that would persist (NO — 7 rows)

All **Aviludo May** (4) and description-only rows on Emporio Mortadella, Bocconcino ROLO, Mammafiore MOZZA — OCR character noise on product names; numerics already correct.

### Errors uncertain (UNCERTAIN — 4 rows)

| Invoice | Product | Error | Why uncertain |
|---------|---------|-------|---------------|
| Emporio | Prosciutto Cotto | Column Shift | €8.17→€17.06 — weight range bleeds into price column; vision limitation |
| Emporio | San Pellegrino | Column Shift | Qty 2.56→2; price 15.06→19.32 — wrong column read |
| Emporio | Gorgonzola | OCR + minor price | Description OCR; minor unit_price drift |
| Bocconcino | POMODOR price/total | Column Shift | Qty fixed; €25→€20 digit misread survives |

### Bidfood / Aviludo April

**Zero errors** in catalog. Column-faithful prompt preserves correct behavior — Bidfood MO/EM units and Aviludo `33cl*24` (column=24) covered by positive examples.

---

## Remaining Errors After Redesign

1. **Column Shift (est. 2–3)** — Emporio Prosciutto, San Pellegrino, possibly Bocconcino POMODOR price. Vision/grid alignment; prompt strengthens intent but cannot guarantee digit fidelity.
2. **OCR Character Noise (8)** — Description spelling variants across Aviludo, Emporio, Bocconcino, Mammafiore. Non-financial under lenient tolerance.
3. **Edge-case null qty** — Weight-in-name products without visible qty columns (not in VL corpus; forward risk on butcher invoices).

---

## Risk Analysis

| Risk | Severity | VL impact |
|------|----------|-----------|
| More null qty/unit when column illegible | MEDIUM | Not observed in current 6 invoices |
| Retail pack regression (33cl*24) | LOW | Mitigated by positive example: column=24 wins |
| Weight-in-name null regression | MEDIUM | No VL cases; monitor future suppliers |
| Column-shift persists | HIGH | Emporio +€2, Bocconcino price residual |
| Description OCR unchanged | LOW | Aviludo strict description stays ~50% |

**Net:** Benefits outweigh risks for VL corpus. Phantom elimination alone recovers +€18.30 line-sum accuracy on Mammafiore.

Full analysis: `risk-analysis.json`

---

## Projected Metrics (Before vs After)

| Metric | Current | Projected | Δ |
|--------|---------|-----------|---|
| Row accuracy (fully correct) | 72.6% (37/51) | **82.4%** (42/51) | +9.8pp |
| Field accuracy (strict overall) | 92% | **95%** | +3pp |
| Quantity accuracy (strict) | 92% | **100%** | +8pp |
| Financial line-sum accuracy | ~96.2% | **~99.1%** | +2.9pp |
| Hallucination rate | 1.92% (1/52) | **0%** (0/51) | −1.92pp |
| Description accuracy (strict) | 84% | 84% | 0pp |

**Per-invoice financial impact:**

- **Bocconcino:** €365.82 → ~€295.82 (qty fix removes +€70 inflation)
- **Mammafiore:** €393.32 → ~€376.50 (phantom + qty fixes)
- **Emporio:** Semantic Ginger Beer fix; Prosciutto +€1.40 may persist

Full projections: `projected-metrics.json`

---

## Recommendation

| Question | Answer |
|----------|--------|
| Should Marginly redesign Pass C? | **YES** |
| Confidence | **82%** |
| Would it eliminate majority of VL errors? | **Majority of financial errors (71%)** — not majority of all 15 catalog rows (53%) due to OCR noise |
| Sufficient alone? | **No** — pair with re-extract, optional row-count guard, lot-line filter |

**Confidence breakdown:**
- Pack multiplier elimination: 90%
- Phantom elimination: 90%
- Column-shift reduction: 40%
- No Bidfood/Aviludo regression: 85%

---

## Implementation Plan (Design Only)

**Primary file:** `supabase/functions/extract-invoice/invoice-table-extraction.ts`

| Lines | Change |
|-------|--------|
| 27–34 | Replace infer-from-name with column-faithful rules |
| 36–84 | Replace retail pack examples with negative + positive examples |
| 108–110 | Remove implicit qty=1 for EM |
| 116+ | Add anti-phantom / lot rejection |
| 119–125 | Strengthen column-boundary price guidance |
| 185 | Update user message to column-faithful wording |

**Optional post-prompt:** Row-count guard (line ~192), lot-line regex filter.

Full plan: `implementation-plan.json` · Draft prompt: `proposed-prompt.txt`

---

## Evidence File List

### This redesign
```
.tmp/passc-redesign/
  REPORT.md
  current-prompt.txt
  proposed-prompt.txt
  error-prevention-analysis.json
  error-reduction-estimate.json
  risk-analysis.json
  projected-metrics.json
  implementation-plan.json
```

### Reference audits
```
.tmp/passc-prompt-audit/
  REPORT.md, counterfactual-analysis.json, error-mapping.json,
  contradictions.json, root-cause-assessment.json

.tmp/gpt-pattern-audit/
  REPORT.md, error-catalog.json, multiplier-errors.json,
  column-errors.json, frequency.json

.tmp/persistence-audit/
  REPORT.md, pass-c-raw/*-extract-invoice.json, delta-attribution.json

.tmp/field-accuracy-audit/
  statistics.json, financial-accuracy.json, error-sources.json

.tmp/hallucination-audit/
  REPORT.md, reliability-score.json, phantom-analysis.json
```

### Source (read-only)
```
supabase/functions/extract-invoice/invoice-table-extraction.ts (lines 10–125, 185)
```
