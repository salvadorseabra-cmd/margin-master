# Final Validation Lab Re-Run — Post Hybrid H + v25

Generated: 2026-06-12  
Deploy: **extract-invoice v25**  
VL project: `bjhnlrgodcqoyzddbpbd`  
Mode: **READ-ONLY** live invokes + ground-truth comparison

---

## Executive Summary

| Metric | Before c33 | After refinement | **Now (v25)** | Δ vs refinement |
|--------|------------|------------------|---------------|-----------------|
| Field Accuracy | 89.41% | 91.80% | **64.13%** | −27.67 |
| Quantity Accuracy | 93.75% | 93.75% | **65.77%** | −27.98 |
| Financial Error € | €181.24 | €66.34 | **€389.97** | +€323.63 |
| Rows Fully Correct | — | — | **31.37%** | — |

**VL Status: PARTIAL** (strict single-run aggregate **OPEN** due to Aviludo April 0-item regression)

Excluding April flake (9 missing GT rows): **€89.02** financial error, **76.96%** field accuracy.

**Re-read safety fix:** Frontend-only — does not affect extraction metrics.

---

## 1. Per-Invoice Results

| Invoice | Items | Field Acc | Qty Acc | Fin Acc | Fin Err € | Status |
|---------|-------|-----------|---------|---------|-----------|--------|
| **Bidfood** | 11/11 | **97.7%** | 100% | 100% | **€0.00** | **CLOSED** |
| **Aviludo May** | 8/8 | 84.4% | 87.5% | 87.9% | €40.00 | OPEN |
| **Aviludo April** | **0/9** | 0% | 0% | 0% | **€300.95** | OPEN |
| **Emporio** | 8/8 | 56.3% | 62.5% | 94.1% | €19.27 | OPEN |
| **Bocconcino** | 7/7 | 71.4% | 71.4% | 94.3% | €28.75 | OPEN |
| **Mammafiore** | 8/8 | 75.0% | 75.0% | 99.8% | **€1.00** | OPEN |

---

## 2. Global Metrics

| Metric | Value |
|--------|-------|
| Invoices audited | 6 |
| Field accuracy (lenient) | 64.13% |
| Quantity accuracy | 65.77% |
| Financial accuracy | 78.43% |
| **Total financial error** | **€389.97** |
| Rows fully correct | 16 / 51 (31.37%) |
| Phantom rows | 0 |

---

## 3. Remaining Structural Families

| Family | Count | Examples |
|--------|-------|----------|
| **missing_row** | 9 | Aviludo April 0-item extract (all rows) |
| **column_shift_or_price** | 17 | Bidfood Manjericão unit; Mammafiore unit variance |
| **quantity** | 8 | Emporio Ginger Beer 24 vs 2; Bocconcino Pomodor 1 vs GT 2 |
| **discount_or_column_shift** | 4 | Prosciutto/Ventricina unit vs GT gross catalog |

---

## 4. Discount Hardening Spot Check (v24/v25)

| Row | Extracted | Visible Invoice | VL GT | Verdict |
|-----|-----------|-----------------|-------|---------|
| **Prosciutto** | 8.50 / **36.54** | 8.50 / **36.54** | 8.17 / 35.14 | ✅ Visible; GT uses net catalog |
| **Ventricina** | 15.19 / **39.48** | 15.19 / **39.49** | 16.60 / 39.49 | ✅ Visible; GT uses gross unit |
| **Mortadella** | 9.88 / 30.62 | 10.10 / 31.07 | 10.10 / 31.07 | PARTIAL (−€0.45) |
| **Pomodor** | 1 / 22.05 / **22.05** | 1 / 22.05 / **22.05** | 2 / 25 / 50 | ✅ Visible; GT mismatch |

---

## 5. Key Wrong Rows (remaining-errors.json)

### Emporio
- Ginger Beer: qty **24** vs GT 2 (total €19.38 correct)
- Gorgonzola: qty 2 vs GT 1.35
- Pellegrino: qty 2 / €25.37 vs GT 2.56 / €38.65
- Prosciutto: unit €8.50 vs GT €8.17 (visible €8.50)
- Ventricina: unit €15.19 vs GT €16.60 (visible net €15.19)

### Bocconcino
- POMODOR: qty **1** / €22.05 vs GT qty 2 / €50 (**matches visible**)

### Aviludo April
- **All 9 rows missing** — v25 returns `items:[]` on PNG fixture (3/3 retries)

### Aviludo May
- Atum: qty 1 vs GT 2 (€13.10 vs €13.10 unit OK, total half)
- Chocolate: total variance
- Anchoas: OCR name drift (amounts OK)

### Mammafiore
- Low € error (€1 total); unit_price fields flagged on several rows

---

## 6. Baseline Comparison Notes

| Stage | Field % | Fin Err € |
|-------|---------|-----------|
| Before c33 | 89.41 | 181.24 |
| After refinement | **91.80** | **66.34** |
| Field-accuracy audit | 95.00 | — |
| **Now v25** | 64.13 | 389.97 |

**Why now appears worse:**
1. **Aviludo April v25 regression** — 0 items (€300.95 error alone)
2. **GPT run variance** — single invoke per invoice; May/Chocolate/Atum differ from refinement cache
3. **GT catalog vs visible** — Prosciutto/Ventricina/Pomodor penalized despite matching visible invoice

**Improvements vs refinement:**
- Mammafiore €1 vs €54.78
- Emporio discount rows stable (Prosciutto/Ventricina)
- Bocconcino Pomodor matches visible net row

---

## 7. VL Status Verdict

### **PARTIAL**

| Invoice | Verdict | Rationale |
|---------|---------|-----------|
| Bidfood | CLOSED | 97.7% field, €0 error |
| Aviludo May | OPEN | €40 error, OCR drift |
| Aviludo April | OPEN | v25 0-item regression |
| Emporio | OPEN | GT mismatch on discount rows; Ginger qty |
| Bocconcino | OPEN | Pomodor GT qty mismatch (visible OK) |
| Mammafiore | OPEN | Low € but field% 75% |

---

## Artifacts

| File | Contents |
|------|----------|
| `metrics.json` | Full per-invoice aligned rows + baselines |
| `remaining-errors.json` | All wrong/missing/phantom rows |
| `executive-summary.json` | Key metrics + status |
| `extracts/*.json` | Raw v25 invoke responses |
| `april-retry.json` | 3× April PNG retry (0 items each) |
| `run-audit.mts` | Reproducible audit script |
| `REPORT.md` | This report |

---

## Recommendations (investigation only)

1. Investigate **Aviludo April v25 0-item** regression (PNG fixture worked at refinement)
2. Update GT catalog: net vs gross units for Emporio discount rows
3. Pomodor GT: align to visible qty=1 or document catalog intent
4. Ginger Beer qty extraction remains structural OPEN item
