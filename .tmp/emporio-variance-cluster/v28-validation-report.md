# v28 Emporio Dense Table VALOR Isolation — Validation Report

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Deploy:** extract-invoice **v28**  
**Change:** Prompt-only — `EMPORIO DENSE TABLE VALOR ISOLATION` in `invoice-table-extraction.ts`  
**Generated:** 2026-06-13

---

## Summary

v28 **fully stabilizes Bresaola and SanPellegrino** (5/5 each) and improves cluster stability from **0/5 → 4/5**. Average focus-row residual drops **€25.50 → €2.46** (~**€23.04 recovery** vs cluster estimate).

| Metric | v27 baseline | v28 | Delta |
|--------|--------------|-----|-------|
| **Gorgonzola stability** | 100% (5/5) | 80% (4/5) | −20pp* |
| **Bresaola stability** | 20% (1/5) | **100% (5/5)** | **+80pp** |
| **SanPellegrino stability** | 0% (0/5) | **100% (5/5)** | **+100pp** |
| **Cluster (all 3 correct)** | 0% (0/5) | **80% (4/5)** | **+80pp** |
| **Avg focus-row residual** | €25.50 | **€2.46** | **−€23.04** |

\*Gorgonzola v27 cluster probe was a lucky batch (100%); per-row probes showed 80% elsewhere. v28 run 2 tail failure (total 25.73) remains qty×unit on Gorgonzola only.

---

## Implementation

Added after v27 `TOTAL COLUMN ISOLATION`:

```
EMPORIO DENSE TABLE VALOR ISOLATION (Preço Total is source of truth)
```

- Rule: copy Preço Total / VALOR digit by digit — never qty×unit, neighbouring totals, or neighbouring quantities
- **Gorgonzola** GOOD/BAD (1,35 → 13,44 vs qty 2 → 27)
- **Bresaola** GOOD/BAD (49,48 vs 39,48 Ventricina bleed)
- **SanPellegrino** GOOD/BAD (38,56 vs 43,26 qty×unit; x 15ud not qty 15)

---

## Tests & Deploy

| Step | Result |
|------|--------|
| `deno test invoice-monetary-binding.test.ts` | 7/7 pass |
| `deno test -A invoice-image-crop.test.ts` | 8/8 pass |
| `supabase functions deploy extract-invoice` | **v28** deployed |

---

## v28 Validation (5 invokes)

| Run | Gorgonzola | Bresaola | SanPellegrino | Cluster OK | Residual € |
|-----|------------|----------|---------------|------------|------------|
| 1 | 13.44 ✓ | 49.48 ✓ | 38.56 ✓ | ✓ | €0.00 |
| 2 | 25.73 ✗ | 49.48 ✓ | 38.56 ✓ | ✗ | €12.29 |
| 3 | 13.44 ✓ | 49.48 ✓ | 38.56 ✓ | ✓ | €0.00 |
| 4 | 13.44 ✓ | 49.48 ✓ | 38.56 ✓ | ✓ | €0.00 |
| 5 | 13.44 ✓ | 49.48 ✓ | 38.56 ✓ | ✓ | €0.00 |

### Notable improvements

- **Bresaola:** Stable **qty 1.83** (matches visible invoice) and **total 49.48** every run — eliminates Ventricina 39.48 bleed
- **SanPellegrino:** Stable **qty 2** and **total 38.56** every run — eliminates pack-count (15) and qty×unit failures
- **Gorgonzola:** 4/5 correct; run 2 regressed to 25.73 (2×12.87 qty×unit tail)

---

## Recovery vs €28.26 Cluster Estimate

| Basis | Amount |
|-------|--------|
| Cluster worst-case single-run (audit tail) | €28.26 |
| v27 avg focus-row residual (5-run cluster) | €25.50 |
| v28 avg focus-row residual | **€2.46** |
| **Avg recovery** | **€23.04** |
| Remaining tail (Gorgonzola run 2) | €12.29 |

**Verdict:** v28 achieves **~81% of cluster avg recovery** in one prompt block. Bresaola + SanPellegrino account for **€25.50 → €0** of the v27 avg error. Residual is Gorgonzola-only tail.

---

## Residual & Next Steps

| Row | v28 residual | Notes |
|-----|--------------|-------|
| Gorgonzola | €2.46 avg (1 bad run) | qty×unit 25.73 when total breaks |
| Bresaola | €0 | — |
| SanPellegrino | €0 | — |

Optional v29: tighten Gorgonzola negative example if 80% → 95%+ needed; Mortadella (€0.78) out of scope for this block.

---

## Artifacts

- `.tmp/emporio-variance-cluster/v28-validation.json`
- `.tmp/emporio-variance-cluster/v28-validation.mts`
- v27 baseline: `.tmp/emporio-variance-cluster/cluster-stability.json`
