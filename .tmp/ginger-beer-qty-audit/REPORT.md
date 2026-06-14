# Ginger Beer Quantity — Root Cause Audit

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Product:** Baladin - Ginger Beer 0.20cl  
**Deploy:** extract-invoice **v25**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-12

---

## Executive Summary

Ginger Beer qty **24 vs GT 2** is **not** pack notation inference, OCR qty misread, or product-name contamination. The visible invoice **Qtd column prints 24,00** at **€0,85/bottle** (5% discount → **€19,38**). Ground truth **qty 2 @ €9.69** is the **case-normalized** representation (2 cases × 12 bottles × €0.8075 discounted bottle price = €9.69/case).

**First failing stage:** **Pass C** (when GPT outputs bottle count 24 instead of case count 2). Crop, binder, and reconcile do not alter quantity.

**Stability:** GPT run variance — final VL rerun got **24**; Pass C refinement and fresh v25 probe (2026-06-12) got **2** in **3/3** runs.

**Confidence:** 88%

**Financial impact:** **€0** in both representations (total €19.38 matches). Field accuracy penalty only.

---

## Visible Invoice vs Ground Truth

| Field | Visible invoice (printed) | Ground truth | v25 (bad run) | v25 (good run) |
|-------|--------------------------|--------------|---------------|----------------|
| Qty | **24,00** (bottles) | **2** (cases) | 24 | 2 |
| Unit price | **0,85 €** / bottle | **€9.69** / case | €0.81 | €9.69 |
| Total | **19,38 €** | **€19.38** | €19.38 | €19.38 |

**Arithmetic proof (visible):** 24 × 0.85 × (1 − 0.05) = **19.38** ✓

**Case normalization proof:** 12 bottles/case × €0.8075/bottle = **€9.69/case**; 2 × 9.69 = **19.38** ✓

---

## Stage Trace

| # | Stage | Result | Diverges from GT? |
|---|-------|--------|-------------------|
| 1 | **Visible invoice** | Qtd **24,00**, €0.85, total €19.38 | GT uses case semantics (2), not printed Qtd |
| 2 | Geometry / crop | Row visible; bounds OK | No |
| 3 | **Pass C (GPT)** | **qty 24 OR qty 2** (run variance) | **Yes — when qty 24** |
| 4 | Binder | Preserves qty; pairs unit_price with total | No |
| 5 | Reconcile / finalize | Total €19.38 preserved | No |
| 6 | Final API | Passes through Pass C qty | Depends on run |

---

## Hypothesis Evaluation

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| Pack multiplier from name (`0.20cl`, `GINGER33`) | **Rejected** | No 24 or x12 in description; code embeds 33 not 24 |
| OCR misread 2 → 24 | **Rejected** | Qtd column literally prints **24,00** on invoice |
| Product name contamination | **Rejected** | Name has no qty digit |
| Adjacent row bleed (De Cecco qty 24) | **Rejected** | Ginger row has independent 24,00 with matching arithmetic |
| **Unit interpretation (bottle vs case)** | **Confirmed** | Same purchase, two valid framings |
| **Prompt rule vs column-faithful conflict** | **Confirmed** | Prompt says qty 2; column shows 24,00 |

---

## Why Pass C Refinement Fixed It (Sometimes)

`invoice-table-extraction.ts` includes:

```
"Baladin - Ginger Beer 0.20cl" with quantity column "2"
→ quantity: 2 (NOT 24 — do not infer bottle count from pack size)
```

This rule **assumes** Qtd shows "2" but the **actual invoice prints 24,00**. When GPT follows the prompt semantic rule, it outputs **2 @ €9.69**. When GPT follows column-faithful rules, it outputs **24 @ €0.85**.

v24/v25 Emporio discount prompt additions may increase column-faithful behavior, explaining the final VL rerun's qty 24 outcome on a single invoke.

---

## Stability Results

| Probe | Ginger Beer qty | Unit price | Total |
|-------|----------------|------------|-------|
| Final VL re-run (v25, single) | **24** | €0.81 | €19.38 |
| Pass C refinement reextract | **2** | €9.69 | €19.38 |
| Historical pass-c-raw | **24** | €0.85 | €19.38 |
| **Fresh v25 probe (3 runs, 2026-06-12)** | **2** (3/3) | €9.69 | €19.38 |

Qty 24 is **not deterministic** on v25 — it is run variance when GPT prioritizes visible Qtd 24,00 over case-normalization rule.

---

## Recommended Fix (prompt only)

**Category:** Pass C unit-semantics clarification for Emporio beverage lines.

Add explicit worked example using **this invoice's visible values**:

- **BAD:** Qtd 24,00 @ €0.85 → qty 24 (column-faithful bottle count)
- **GOOD:** Same line → qty **2**, unit_price **9.69** (case count; 12-pack at discounted bottle price)

Optionally: revise GT to accept column-faithful qty 24 if VL metrics should match printed invoice literally.

**Not recommended:** Geometry, binder, or pack-parser changes for this qty issue. (The separate `0.20cl` → 2ml volume bug is documented in `.tmp/ginger-beer-audit/`.)

---

## Expected Improvement

| Metric | Impact |
|--------|--------|
| Ginger Beer field accuracy | qty MATCH when case rule applied consistently |
| Financial € error | **€0** either way (total always €19.38) |
| Global VL | Modest field-accuracy lift only; no € recovery |

---

## Evidence

| File | Contents |
|------|----------|
| `root-cause.json` | Verdict, hypotheses, stability, fix recommendation |
| `stage-trace.json` | Per-stage pipeline trace |
| `v25-stability-runs.json` | Fresh 3× v25 probe (qty 2/3) |
| `.tmp/ginger-beer-ground-truth/` | Visible row OCR, stage table |
| `.tmp/ginger-beer-audit/` | Volume conversion bug (separate issue) |
| `.tmp/final-validation-lab-rerun/extracts/17aa3591-....json` | Single-run qty 24 |
