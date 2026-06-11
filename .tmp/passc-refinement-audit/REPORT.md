# Pass C Refinement Audit (post-c33a7f1)

Generated: 2026-06-11T00:57:42.179Z

## Executive Summary

Commit c33a7f1 eliminated hallucinations and pack-multiplier errors but introduced **3 targeted regressions**. Row-level tracing shows:

| Regression | Root Cause | Financial Impact |
|------------|------------|------------------|
| Bidfood Hortelã | Prompt herb-MO template bias; fractional 0,5 kg → 1 MO | €0 (qty wrong, total OK) |
| Aviludo May Açúcar | Column shift: digit **9** from price **9,99** → qty | **€79.92** |
| Mammafiore Aceto | Discounted-line total column variance | **€1.00** |

**Recommendation: Implement refinement — YES (78% confidence).** Two fixes are minimal and high-confidence; Aceto is optional (€1, qty already correct).

## Fractional Quantity Findings (Bidfood Hortelã)

- **GT:** qty 0.5 kg, unit_price €6.74/kg, total €2.70
- **Old prompt:** 0.5 kg ✅ (contextual weight inference)
- **c33a7f1:** 1 MO, unit_price €2.70 (= total) ❌
- **0.5 visually readable?** YES — same image produced 0.5 in old extract, DB, and footer retry
- **Prompt contributed?** YES — Tomilho/Manjericão MO examples without Hortelã fractional-kg counter-example
- **OCR lost decimal?** Unlikely primary cause

## Pack Notation Findings (Aviludo May Açúcar)

- **GT:** qty 1 cx, €9.99 total
- **Old prompt:** qty 1 ✅
- **c33a7f1:** qty **9**, total €89.91 ❌
- **Where does 9 originate?** Leading digit of **9,99** unit price column — NOT description "10x1" (would be 10)
- **First error stage:** Pass C / extract-invoice (reextract JSON)
- **Evidence:** 9 × 9.99 = 89.91 exact; vl-ocr-rc shows separate failure mode (qty=10 from 10x1) in other runs

## Aceto Findings (Mammafiore)

| Stage | qty | unit_price | total | Δ from GT |
|-------|-----|------------|-------|-----------|
| GT | 1 | 18.929 | 16.09 | — |
| pass-c-raw (old) | 2 | 13.80 | 15.96 | multiplier error |
| Before c33a7f1 | 1 | 18.295 | 15.90 | −€0.19 |
| After c33a7f1 | 1 | 18.829 | 15.09 | −€1.00 |

- c33a7f1 **fixed qty** (2→1) but **worsened total drift**
- Discounted line: qty×price ≠ total; model variance on VALOR column
- Not pack-multiplier; partial model non-determinism

## Remaining Error Taxonomy

Total absolute financial error post-c33a7f1: **€92.35**

| Category | Count | Key rows |
|----------|-------|----------|
| Fractional Quantity | 2 | Hortelã (regression), Bresaola (pre-existing) |
| Pack Notation | 0 | c33a7f1 fixed; Açúcar reclassified as Column Shift |
| Column Shift | 3 | Açúcar €79.92, POMODOR €10, Prosciutto €1.4 |
| OCR Noise | 2 | Aceto €1, Rulo €0.03 |

## Minimal Prompt Refinements

1. **Fractional KG rule** — copy 0,5 decimals when unit=KG; disambiguate from MO herbs
2. **Column isolation rule** — qty never from price column; 10x1 in description ≠ qty when column shows 1
3. **Discounted-line rule** — copy VALOR total digit-by-digit even when qty×price ≠ total

See `counterfactual-rules.json` for full proposed text.

## Projected Impact

| Metric | Current (c33a7f1) | Refined Estimate |
|--------|-------------------|------------------|
| Field Accuracy | 91.87% | ~95.2% |
| Quantity Accuracy | 92.24% | ~98.0% |
| Financial Error | €92.35 | ~€12.4 |
| Hallucination Rate | 0% | 0% |

## Validation Lab Readiness

**MOSTLY YES** — Geometry, footer, row recall, and hallucinations are solved. Three c33a7f1 regressions block full VL sign-off; two pre-existing price-column errors (Bocconcino, Emporio Prosciutto) remain out of scope.

## Recommendation

**Implement refinement? YES (78% confidence)**

Two of three regressions have clear, minimal prompt fixes with HIGH confidence (Hortelã fractional kg, Açúcar column bleed). Aceto is lower priority (€1, qty already fixed). Refinement preserves all c33a7f1 wins (0% hallucination, Ginger Beer, Aviludo April totals).

## Evidence Files

| File | Description |
|------|-------------|
| `fractional-quantity-audit.json` | Hortelã full trace |
| `pack-notation-audit.json` | Açúcar origin-of-9 analysis |
| `aceto-audit.json` | Aceto discounted-line drift |
| `error-taxonomy-after-c33a7f1.json` | All unresolved errors classified |
| `counterfactual-rules.json` | Minimal prompt additions |
| `projected-impact.json` | Current vs refined metrics |
| `readiness-assessment.json` | VL completion verdict |
| `run-audit.mts` | Reproducible generator |
| `REPORT.md` | This report |
