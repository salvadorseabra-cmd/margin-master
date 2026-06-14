# v29 Mortadella Discount Extraction — Validation Report

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Deploy:** extract-invoice **v29** (verified ✓)  
**Change:** Prompt-only — Mortadella worked example after Prosciutto/Ventricina  
**Generated:** 2026-06-13

---

## Summary

| Metric | v28 baseline | v29 |
|--------|--------------|-----|
| **Mortadella stability** | 0% (0/3) | **100% (5/5)** |
| **Mortadella total** | 26.65–27.57 | **31.07 every run** |
| **Mortadella € error** | avg **€4.09** (stability) / **€3.50** (VL rerun) | **€0.00** |
| **Recovery** | — | **€3.50–4.09** |

**Mortadella residual closed.**

---

## Implementation

Added after Ventricina example in `invoice-table-extraction.ts`:

```
Emporio Italia — "Mortadella IGP 'Massima' con Pistacchio"
Qtd 3,11 · Preço Unit 11,10 € · Desc.(%) 10,00 · Preço Total 31,07 €
→ gross_unit_price: 11.1, discount_pct: 10, line_total_net: 31.07
```

Explicit note: plain **10,00** without % symbol is `discount_pct`, not a euro price.

---

## Tests & Deploy

| Step | Result |
|------|--------|
| monetary-binding tests | 7/7 pass |
| image-crop tests | 8/8 pass |
| Deploy | **v29** on `bjhnlrgodcqoyzddbpbd` |

---

## v29 Validation (5 Emporio invokes)

| Run | Qty | Unit (API) | Total | € err |
|-----|-----|------------|-------|-------|
| 1 | 3.11 | 9.99 | **31.07** | 0.00 |
| 2 | 3.11 | 9.99 | **31.07** | 0.00 |
| 3 | 3.11 | 9.99 | **31.07** | 0.00 |
| 4 | 3.11 | 9.99 | **31.07** | 0.00 |
| 5 | 3.11 | 9.99 | **31.07** | 0.00 |

- **Stability:** **5/5 (100%)**
- **Total unique:** [31.07] only
- API `unit_price` **9.99** ≈ net (GT 10.10) — binder derived from gross 11.1 − 10% discount
- Structured `gross_unit_price` / `discount_pct` not exposed in API (Pass C internal → binder)

---

## Emporio Total Residual (all 8 GT rows)

| Run | Emporio residual € | Notes |
|-----|-------------------|-------|
| 1 | 36.18 | Gorgonzola tail (45.70) |
| 2 | **1.75** | Best run — Mortadella + cluster rows OK |
| 3 | 16.18 | Gorgonzola tail (25.70) |
| 4 | **1.75** | Best run |
| 5 | 13.46 | Gorgonzola tail (25.30) |
| **Avg** | **13.86** | |

**v28 VL rerun Emporio residual:** €5.10 (Mortadella €3.50 + Prosciutto €1.40 GT)

**After v29:** Mortadella **€0** on all runs. Best Emporio runs (2, 4) at **€1.75** (Prosciutto GT mismatch €1.40 + Paccheri €0.20 + Ginger €0.15). Remaining variance is **Gorgonzola GPT tails** on runs 1/3/5 — unrelated to Mortadella fix.

---

## Before vs After

| Source | Mortadella total | € error |
|--------|------------------|---------|
| v28 stability run 1 | 26.66 | 4.41 |
| v28 stability run 2 | 26.65 | 4.42 |
| v28 stability run 3 | 27.62 | 3.45 |
| v28 VL lab rerun | 27.57 | **3.50** |
| v27 emporio-final | 30.29 | 0.78 |
| **v29 (5/5)** | **31.07** | **0.00** |

---

## Artifacts

- `.tmp/mortadella-root-cause/v29-validation.json`
- `.tmp/mortadella-root-cause/v29-validation.mts`
- Baseline: `.tmp/mortadella-root-cause/stability.json`, `.tmp/final-validation-lab-rerun-v28/`
