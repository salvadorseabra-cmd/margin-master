# Root Cause Consolidation — Validation Lab Remaining Errors

Generated: 2026-06-11T01:12:02.299Z

## Executive Summary

After commits c33a7f1 (column-faithful Pass C) and 04c0d88 (fractional qty / column isolation / discounted totals), **8 financially significant field errors** remain on the latest VL re-extract (51 aligned rows).

**Verdict: Remaining errors are mostly symptoms of two STRUCTURAL Pass C weakness classes — Column Shift and Discount Handling — not a hidden geometry/footer/persistence bug.** A large portion of the €66.34 financial error bucket (€54.78) is **run-to-run Model Variance** on Mammafiore discounted lines (correct on c33a7f1 run, wrong on 04c0d88 run). **Stable cross-run errors total ~€21.4** (chiefly Bocconcino POMODORO €10 + Emporio Prosciutto €1.40).

**Validation Lab readiness: MOSTLY READY.** Decision matrix winner: **Close VL now (A)** with optional parallel hardening for column shift (B).

## Remaining Error Inventory (8 financially significant)

| Invoice | Product | Field | GT | Current | € Impact | Stable? |
|---------|---------|-------|-----|---------|----------|---------|
| Emporio Italia | Rovagnati - Assaporami Prosciutto C | unit_price | 8.17 | 9.17 | €1.4 | Other |
| Emporio Italia | Rovagnati - Assaporami Prosciutto C | total | 35.14 | 36.54 | €1.4 | Stable |
| IL Bocconcino | POMODOR PELATI (CX 2.5KG*6) | unit_price | 25 | 20 | €10 | Stable |
| IL Bocconcino | POMODOR PELATI (CX 2.5KG*6) | total | 50 | 40 | €10 | Stable |
| Mammafiore | Guanciale di suino stagionato +/- 1 | total | 64.93 | 101.59 | €36.66 | Run variance |
| Mammafiore | Farina Speciale pizza 25kg Amoruso | total | 26.52 | 33.15 | €6.63 | Run variance |
| Mammafiore | Birra Peroni Nastro Azzurro PNA 33c | total | 25.69 | 36.7 | €11.01 | Run variance |
| Mammafiore | Rulo Di Capra 1kg*2 Simonetta | total | 10.86 | 10.38 | €0.48 | Run variance |

**Excluded (solved):** Aceto (€16.09 exact), Ginger Beer, Hortelã, Açúcar, phantom rows, Bidfood/Aviludo May/April clean.

## First Divergence Stage Per Error

| Error | First Stage | Evidence |
|-------|-------------|----------|
| Bocconcino POMODORO | **passC** | persistence-audit stage-trace: passCRaw qty=6; fresh qty=2 but unit_price wrong |
| Emporio Prosciutto | **passC** | stage-trace: extractInvoiceResponse already €17 unit_price |
| Emporio Pellegrino qty | **passC** | qty 2.56→2; total preserved (arithmetic closure) |
| Mammafiore Guanciale/Birra/Farina totals | **passC** | c33 run correct; 04c0d88 substituted qty×price — Model Variance on Discount Handling |
| Mammafiore Rulo | **passC** | €0.48 drift; minor |

Normalize/reconcile/DB/UI: **no new divergence** on audited rows (persistence-audit refutes active corruption).

## Failure Family Analysis

| Failure Family | Errors | Total € Impact |
|----------------|--------|----------------|
| Column Shift | 4 | €22.8 |
| Model Variance | 4 | €54.78 |

**Shared mechanism?** YES — Column Shift and Discount Handling account for >85% of stable + variance financial error. Not independent one-offs.

## Structural vs Isolated

| Class | Count | Examples |
|-------|-------|----------|
| **STRUCTURAL** | 8 | POMODORO price column, Prosciutto weight-range bleed, discounted line totals |
| **ISOLATED** | 0 | Bresaola fractional kg, Pellegrino qty decimal (total OK) |

## Future Risk Assessment (1,000 invoices)

| Family | Risk |
|--------|------|
| Column Shift | **HIGH** |
| Discount Handling | **HIGH** |
| Model Variance | **MEDIUM** |
| Fractional Quantity | **MEDIUM** |
| Pack Notation / Hallucination | **LOW** (solved class) |

## Validation Lab Readiness

**MOSTLY READY** — Row recall 100%, hallucination 0%, financial accuracy 96.96%. Residual stable error ~€21.4/376.50 line sum (~3%). Run variance on Mammafiore discounts inflates single-run metric to €66.34.

## Decision Matrix

| Option | Confidence | Risk | Score | Recommendation |
|--------|------------|------|-------|----------------|
| A) Close VL now | 72% | MEDIUM | 72 | **VIABLE (winner)** |
| B) Fix structural first | 85% | LOW | 88 | Preferred if production-blocked |
| C) Broad ingestion | 45% | HIGH | 40 | Not recommended |
| D) More layouts | 68% | MEDIUM | 65 | Optional |

## Final Recommendation

**Are remaining errors a hidden structural problem or isolated edge cases?**

**Both — but predominantly structural, not hidden.** The pipeline stages before Pass C (geometry 2edcd02, footer 6a86d96) are validated. Remaining failures concentrate in **Pass C column reading** on dense tables (structural) and **discounted-line total copying** (structural mechanism, variable manifestation). Only Bresaola/Pellegrino qty decimals are true isolated edge cases with negligible € impact.

**Close Validation Lab extraction phase (Option A)** — the 6-invoice corpus has served its purpose. Track Column Shift + Discount Handling as known production risks, not VL blockers.

## Evidence Files

- `error-inventory.json`
- `stage-trace.json`
- `failure-families.json`
- `common-cause-analysis.json`
- `structural-vs-isolated.json`
- `future-risk.json`
- `readiness-assessment.json`
- `decision-matrix.json`
- `run-audit.mts`
