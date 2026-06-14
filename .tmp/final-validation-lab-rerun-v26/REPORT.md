# Final Validation Lab Re-run — v26

**Generated:** 2026-06-12  
**Deploy:** extract-invoice **v26** (VL `bjhnlrgodcqoyzddbpbd`)  
**Methodology:** `.tmp/final-validation-lab-rerun-v26/run-audit.mts` (same alignment as v25 rerun)

## Harness fixes applied

1. **Aviludo April** — b64 data URL prefix normalization (no double `data:image/png;base64,` prefix)
2. **Chocolate Pantagruel** — v26 row-isolation monetary prompt (deployed)

---

## Global Metrics

| Metric | v26 | v25 rerun | Post-refinement | Before c33 |
|--------|-----|-----------|-----------------|------------|
| **Field Accuracy** | **82.65%** | 64.13% | 91.80% | 89.41% |
| **Quantity Accuracy** | **84.23%** | 65.77% | 93.75% | 93.75% |
| **Financial Accuracy** | **87.91%** | 78.43% | — | — |
| **Financial Error €** | **€220.27** | €389.97 | €66.34 | €181.24 |
| **Rows Fully Correct %** | **43.14%** | 31.37% | — | — |
| **Phantom rows** | 0 | 0 | 0 | — |

**Δ vs v25:** Field +18.52pp, Qty +18.46pp, **€ error −€169.70**

---

## VL Status: **OPEN**

| Status | Count | Invoices |
|--------|-------|----------|
| CLOSED | 1 | Bidfood |
| PARTIAL | 1 | Aviludo May |
| OPEN | 4 | Aviludo April, Emporio, Bocconcino, Mammafiore |

---

## Per-Invoice Breakdown

| Invoice | Status | Field % | Qty % | Fin Err € | Items | Rows OK % | vs v25 |
|---------|--------|---------|-------|-----------|-------|-----------|--------|
| Bidfood | CLOSED | 97.73 | 100 | €0 | 11 | 81.82 | unchanged |
| **Aviludo May** | **PARTIAL** | 93.75 | 87.5 | **€0** | 8 | 62.5 | **−€40** (Chocolate fixed) |
| Aviludo April | OPEN | 86.11 | 100 | €169.08 | **9** | 33.33 | **+9 rows** (harness fix; totals column issue) |
| Emporio | OPEN | 71.88 | 75 | €11.99 | 8 | 25 | improved |
| Bocconcino | OPEN | 71.43 | 42.86 | €38.20 | 7 | 28.57 | worse qty |
| Mammafiore | OPEN | 75 | 100 | €1 | 8 | 12.5 | unchanged € |

### Aviludo May (Chocolate fix verified)

- **Chocolate:** 2 CX @ **€29.99** = **€59.98** ✅ (was €9.99/€19.98 on v25)
- **Açúcar:** 1 @ €9.99 = €9.99 ✅ (preserved)
- Remaining field issues: Atum qty 1 vs GT 2 (€0 impact), OCR name drift on Pepinos/Nata

### Aviludo April (harness fix verified)

- **9/9 rows extracted** (was 0/9 on v25 due to double-prefix bug)
- €169 error from **line_total column** — many rows show total = unit_price (single-unit read, e.g. Chocolate total €29.19 vs GT €58.38)
- Pre-existing extraction issue, not harness-related

---

## Remaining Wrong Rows (financial impact > €0)

| Invoice | Product | € error | Family |
|---------|---------|---------|--------|
| Aviludo April | Ovo Líquido | €73.16 | column_shift_or_price |
| Aviludo April | Chocolate Pantagruel | €50.95 | column_shift_or_price |
| Bocconcino | POMODOR PELATI | €38.20 | discount_or_column_shift |
| Aviludo April | Pepinos Extra | €29.19 | column_shift_or_price |
| Emporio | SanPellegrino | €10.06 | quantity + column_shift |
| Aviludo April | Atum | €6.29 | column_shift_or_price |
| Emporio | Prosciutto | €1.40 | discount_or_column_shift |
| Mammafiore | Farina Speciale | €1.00 | column_shift_or_price |

---

## Structural Families (remaining)

| Family | Count |
|--------|-------|
| column_shift_or_price | 18 |
| quantity | 7 |
| discount_or_column_shift | 4 |
| missing_row | **0** (was 9 on v25) |

---

## Key Improvements vs v25

- April harness fix: **9 rows recovered**, **−€300.95** false missing-row error
- Chocolate v26: **−€40** on May (29.99/59.98 stable)
- Global € error: **€389.97 → €220.27** (−43.5%)
- Field accuracy: **64% → 83%**

## Remaining Gaps vs Post-Refinement Baseline

- April line-total column reads (€169 — totals = unit prices on multi-qty rows)
- Bocconcino Pomodor (€38 — GT vs visible mismatch)
- Emporio discount/GT catalog variance (€12)
- Mammafiore unit_price field flags (€1)

---

## Artifacts

| File | Contents |
|------|----------|
| `metrics.json` | Full per-invoice metrics + baselines |
| `remaining-errors.json` | All non-fully-correct rows |
| `executive-summary.json` | VL status + deltas |
| `extracts/` | Per-invoice v26 extraction JSON |
| `run-audit.mts` | Reproducible audit script |
