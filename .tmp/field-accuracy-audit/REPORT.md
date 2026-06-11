# Validation Lab Field Accuracy Audit

**Date:** 2026-06-10 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only**

Field-level extraction accuracy across all 6 Validation Lab invoices. Focus: **are extracted numbers correct?**

Cross-reference: geometry-audit (row recall 100%), hallucination-audit (1 phantom Mammafiore), mammafiore-line-audit, bocconcino-investigation, emporio-footer-audit.

---

## Executive Summary

| Metric | Lenient | Strict |
|--------|---------|--------|
| **Overall field accuracy** | **95%** | **92%** |
| **Rows fully correct** (all 5 fields MATCH) | **72.55%** (37/51) | — |
| **Rows with ≥1 WRONG/MISSING** | **11.76%** | — |

### Per-field accuracy (lenient: MATCH + MINOR_VARIATION)

| Field | Lenient | Strict |
|-------|---------|--------|
| Description | 100% | 84% |
| Quantity | 92% | 92% |
| Unit | 98% | 98% |
| Unit Price | 94% | 94% |
| Line Total | 92% | 90% |

**Financial:** 3/6 invoices have line-sum delta < €0.50. Invoice footer totals all match expected (geometry/footer fixes applied).

**Phantoms:** 1 extra DB row(s) — Mammafiore `Olio Nuto` (GPT hallucination, €18.30).

---

## Financial Accuracy Table

| Invoice | GT Line Sum | Extracted Line Sum | Δ Line Sum | GT Invoice Total | DB Invoice Total | Δ Invoice Total |
|---------|-------------|-------------------|------------|-------------------|------------------|-------------------|
| Bidfood Portugal | €170.57 | €170.57 | +€0.00 | €292.70 | €292.70 | +€0.00 |
| Aviludo May | €296.88 | €296.88 | +€0.00 | €330.42 | €330.42 | +€0.00 |
| Aviludo April | €300.95 | €300.95 | +€0.00 | €370.17 | €370.17 | +€0.00 |
| Emporio Italia | €276.76 | €278.76 | +€2.00 | €327.46 | €327.46 | +€0.00 |
| IL Bocconcino | €295.82 | €365.82 | +€70.00 | €290.64 | €290.64 | +€0.00 |
| Mammafiore | €376.50 | €393.32 | +€16.82 | €415.96 | €415.96 | +€0.00 |

---

## Worst Errors (top 10 WRONG fields)

| Invoice | Field | Ground Truth | Extracted | Source |
|---------|-------|--------------|-----------|--------|
| Emporio Italia | unit_price | 8.17 | 17 | Persistence |
| Emporio Italia | line_total | 35.14 | 36.54 | Persistence |
| Emporio Italia | quantity | 2.56 | 2 | Persistence |
| Emporio Italia | unit_price | 15.06 | 19.3 | Persistence |
| Emporio Italia | unit | "un" | "cx" | Persistence |
| IL Bocconcino | quantity | 2 | 6 | Persistence |
| IL Bocconcino | unit_price | 25 | 20 | Persistence |
| IL Bocconcino | line_total | 50 | 120 | Persistence |
| Mammafiore | quantity | 1 | 2 | GPT Extraction |
| Mammafiore | line_total | 16.09 | 15.09 | Persistence |

---

## Root Cause Distribution (WRONG + MINOR description)

| Source | Count |
|--------|-------|
| OCR | 8 |
| GPT Extraction | 3 |
| Normalization | 0 |
| Reconcile | 0 |
| Persistence | 9 |

---

## Invoice Ranking (best → worst)

| Rank | Invoice | Composite | Field Acc | Rows Correct | Financial | Phantoms |
|------|---------|-----------|-----------|--------------|-----------|----------|
| 1 | Bidfood Portugal | 100% | 100% | 100% | 100% | 0 |
| 2 | Aviludo April | 100% | 100% | 100% | 100% | 0 |
| 3 | Aviludo May | 83.33% | 100% | 50% | 100% | 0 |
| 4 | Mammafiore | 82.68% | 90% | 62.5% | 95.53% | 1 |
| 5 | IL Bocconcino | 79.59% | 91% | 71.43% | 76.34% | 0 |
| 6 | Emporio Italia | 74.93% | 88% | 37.5% | 99.28% | 0 |

---

## Readiness Assessment: **MOSTLY READY**

Row recall and invoice totals are solid; field fidelity gaps remain on qty/unit/description for some suppliers. Aviludo April ground truth is DB-circular (excluded from strict claims).

### Evidence
- Geometry fixes verified: Mammafiore (2edcd02), Bocconcino (3b089b9), Emporio footer (6a86d96)
- Row recall 100% across corpus (hallucination-audit)
- 1 phantom row (Mammafiore Olio Nuto) inflates line sum by €18.30 vs 8-row ground truth
- **Bocconcino critical:** DB line sum **€365.82** exceeds invoice total **€290.64** by €75 — `POMODORINI pelati` persisted as qty 6 / total €120 vs ground-truth `POMODOR PELATI` qty 2 / €50 (GPT misread pack size). Footer total correct; line items not reconciled to subtotal.
- Mammafiore: Aceto qty 2 vs GT 1 and Rulo qty 2 vs GT 1 — GPT confuses `*2` pack notation with quantity
- Aviludo April: ground truth rows copied from DB → field accuracy tautologically high; not used for cross-validation

---

## Recommendation (design only)

1. **Numeric reconcile gate:** Flag rows where `|qty × unit_price − total| > €0.10` before persist.
2. **Phantom rejection:** Drop Pass C rows with no artigo/SKU anchor (Mammafiore pattern).
3. **Description normalization:** Accept MINOR_VARIATION for matching; store canonical supplier SKU separately.
4. **Unit canonicalization:** Map GPT `kg` vs invoice `un` for weight-based lines (Guanciale) at normalize stage.
5. **Regression suite:** Per-invoice field accuracy thresholds — Bidfood/Emporio/Bocconcino require 100% strict numeric MATCH.

---

## Evidence Files

```
.tmp/field-accuracy-audit/
  run-audit.mts
  ground-truth.json
  extracted-data.json
  row-alignment.json
  field-comparison.json
  statistics.json
  financial-accuracy.json
  error-sources.json
  invoice-ranking.json
  REPORT.md

Cross-reference:
  .tmp/geometry-audit/
  .tmp/hallucination-audit/
  .tmp/mammafiore-line-audit/
  .tmp/bocconcino-investigation/
  .tmp/emporio-footer-audit/
  .tmp/footer-validation-4dc40c3/
```
