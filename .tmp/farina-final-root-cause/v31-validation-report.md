# Farina Valor Digit Drift — v31 Validation

**Deploy:** extract-invoice **v31** on `bjhnlrgodcqoyzddbpbd`  
**Invoice:** Mammafiore `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Generated:** 2026-06-13

---

## Verdict: **FAIL**

| Metric | v30 (before) | v31 (after) |
|--------|--------------|---------------------------|
| Correct vs GT | **0/10** (0%) | **3/5** (60%) |
| Stable total | 25.52 | [26.52,25.52] |
| Avg € error | €1.00 | €0.4 |
| Recovery | — | €0.6 |

**Target:** 5/5 at total **€26.52**

---

## Per-Run Results

| Run | Qty | Unit Price | Total | Correct | € Error |
|-----|-----|------------|-------|---------|---------|
| 1 | 1 | 26.52 | 26.52 | ✓ | €0 |
| 2 | 1 | 26.52 | 26.52 | ✓ | €0 |
| 3 | 1 | 26.52 | 25.52 | ✗ | €1 |
| 4 | 1 | 26.52 | 25.52 | ✗ | €1 |
| 5 | 1 | 26.52 | 26.52 | ✓ | €0 |

---

## Focus-Row Class A Impact

- **Before (v30):** Farina sole Class A deterministic bug — €1.00 stable across 10/10 runs
- **After (v31):** Farina still failing — Class A remains
- **Remaining deterministic € on focus rows:** €0.4

---

## Prompt Change

Added Farina GOOD/BAD example + Valor digit rule in `invoice-table-extraction.ts` MAMMAFIORE COLUMN ISOLATION block (after Rulo example).
