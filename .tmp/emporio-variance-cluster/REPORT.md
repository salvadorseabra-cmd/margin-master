# Emporio Variance Cluster — Gorgonzola · Bresaola · SanPellegrino

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Deploy:** extract-invoice **v27**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Executive Summary

| Question | Answer |
|----------|--------|
| **Same Pass C failure mode?** | **Yes — one Emporio variance family (A)** with sub-patterns |
| **Three independent bugs?** | **No (B rejected)** — same stage, same crop, correlated bad runs |
| **Confidence** | **86%** |
| **Next implementation** | **v28 prompt block** — `EMPORIO_DENSE_TABLE_VALOR_ISOLATION` with 3 row examples |
| **Estimated € recovery** | **~€25–28** (worst single-run tail **€28.26**) |

---

## Verdict: A) One Underlying Emporio Variance Family

All three rows share:

1. **First failing stage:** Pass C (`passC_table_extraction`) — geometry and binder OK  
2. **Same invoice region:** Single 8-column Emporio table crop (bounds top 456–851)  
3. **Core failure:** `line_total_net` not copied from **Preço Total (VALOR)** — replaced by **qty×unit synthesis** or **wrong/adjacent-row values**  
4. **GPT variance:** Not deterministic — stability differs by row and probe batch  

**Sub-patterns within the family:**

| Row | Unique twist | Stability (cluster 5-run) |
|-----|--------------|----------------------------|
| **Gorgonzola** | Fractional kg; description `1/8 ~1,5kg` confuses qty | **100%** (5/5) |
| **Bresaola** | Weight row; **39,48 ≈ Ventricina 39,49** adjacent bleed | **20%** (1/5) |
| **SanPellegrino** | Case row; **`x 15ud` → qty 15** pack-metadata trap | **0%** (0/5) |

---

## Row Comparison Matrix

### Visible vs GT vs Best vs Worst

| Row | Visible Qtd | Visible Total | GT Total | Best run total | Worst run total | Audit € err |
|-----|-------------|---------------|----------|----------------|-----------------|-------------|
| Gorgonzola | 1,35 kg | **13,44** | 13.44 | 13.44 | 27.00 | **€13.56** |
| Bresaola | 1,83 kg | **49,48** | 49.48 | 49.48 | 39.48 | **€10.00** |
| SanPellegrino | 2,00 cx | **38,56** | 38.56 | 38.56 | 12.30 | **€4.70** |

*GT qty differs from printed Qtd on Bresaola/SanPellegrino (catalog normalization); financial anchor is **Preço Total**.*

### Unified cluster stability (5 v27 invokes, all 3 rows per run)

Source: `.tmp/emporio-variance-cluster/cluster-stability.json`

| Run | Gorgonzola | Bresaola | SanPellegrino | All OK? |
|-----|------------|----------|---------------|---------|
| 1 | 13.44 ✓ | 39.48 ✗ | 12.30 ✗ | No |
| 2 | 13.44 ✓ | 49.48 ✓ | 14.82 ✗ | No |
| 3 | 13.44 ✓ | 39.48 ✗ | 48.84 ✗ | No |
| 4 | 13.44 ✓ | 44.54 ✗ | 26.92 ✗ | No |
| 5 | 13.44 ✓ | 45.38 ✗ | 12.04 ✗ | No |

| Metric | Gorgonzola | Bresaola | SanPellegrino |
|--------|------------|----------|---------------|
| **Stability** | 100% | 20% | **0%** |
| **Avg € error** | €0 | €5.81 | **€19.69** |
| **All-three-correct** | — | — | **0/5** |

**4/5 runs had ≥2 rows wrong on the same invoke** — failures correlate on one Pass C call.

---

## Failure Mode Analysis

### 1. Where do wrong values come from?

| Source | Gorgonzola | Bresaola | SanPellegrino |
|--------|:----------:|:--------:|:-------------:|
| **VALOR confusion / qty×unit** | ✓ primary | ✓ primary | ✓ primary |
| **Qty confusion** | ✓ (1/8, ~1,5kg) | ✓ (weight) | ✓ (**15 from x 15ud**) |
| **Adjacent row bleed** | — | ✓ (→ Ventricina 39,49) | ✓ (→ Bresaola 49,48) |
| **Discount confusion** | — | — | — |
| **Weight-row interpretation** | ✓ | ✓ | — (case row) |

### 2. Do bad runs reuse nearby row values?

**Yes.**

- Bresaola **39.48** ≈ Ventricina visible **39,49 €** (same audit extract)
- SanPellegrino **48.84** ≈ Bresaola **49,48 €** (cluster run 3)

### 3. Same invoice region?

**Yes** — all rows in one Pass C table crop; same geometry bounds.

### 4. Can one prompt example fix all three?

**Partially.** One shared **Emporio dense-table block** with:

- Shared rules: copy VALOR; never qty×unit when Preço Total visible; Desc.(%) format  
- **Three row-specific positive examples** (weight ×2 + case ×1)  
- SanPellegrino **negative**: `75cl x 15ud` → qty from **Qtd column (2,00)**, not 15  

---

## Pass C Behaviour Summary

```
                    GOOD RUN                          BAD RUN
                    ────────                          ───────
Gorgonzola          total ← 13,44 (VALOR)             total ← 2×13,5 = 27
Bresaola            total ← 49,48 (VALOR)             total ← 39,48 (≈Ventricina)
SanPellegrino       total ← 38,56 (VALOR)             qty ← 15 from "x 15ud"; total ← 12,30
```

When **total is correct**, qty and unit_price **trade off** to reconcile (e.g. Bresaola 2.3 × 21.52 ≈ 49.48) — classic Emporio weight/case variance.

---

## Why Not Three Independent Bugs?

| Criterion | Evidence |
|-----------|----------|
| Same stage | Pass C only for all three |
| Same template | Emporio 8-col, Desc.(%) without % symbol |
| Correlated failures | 0/5 all-correct; 4/5 multi-row bad |
| Shared prompt gap | No Emporio-specific VALOR examples for weight/case rows |
| column-shift-audit | Same dense-table column-selection failure class (different from Prosciutto/Pomodor deterministic shift) |

SanPellegrino's **pack-metadata qty** is a **sub-pattern**, not a separate pipeline bug.

---

## Recommended Next Implementation

**Target:** `invoice-table-extraction.ts` → **v28** prompt block

**`EMPORIO_DENSE_TABLE_VALOR_ISOLATION`** — after v27 TOTAL COLUMN ISOLATION:

1. **SanPellegrino** (highest priority — 0% stability, avg €19.69)  
   - Positive: Qtd **2,00** · Preço Unit **21,42** · Desc **10,00** · Preço Total **38,56**  
   - Negative: **15** from `x 15ud` is NOT quantity  

2. **Bresaola**  
   - Positive: Qtd **1,83** · Preço Unit **33,80** · Desc **20,00** · Preço Total **49,48**  
   - Negative: **39,48** is Ventricina's row — not Bresaola  

3. **Gorgonzola**  
   - Positive: Qtd **1,35** · Preço Unit **12,90** · Desc **22,85** · Preço Total **13,44**  
   - Negative: never **27** when VALOR prints **13,44**  

**Not recommended:** geometry change, per-row binder, GT qty changes.

---

## Estimated € Recovery

| Basis | Amount |
|-------|--------|
| v27 audit worst-case (single run) | **€28.26** (13.56 + 10.00 + 4.70) |
| Cluster avg errors (5-run) | **€25.50** (0 + 5.81 + 19.69) |
| Target at 90%+ stability | **~€25–28** |

SanPellegrino dominates cluster avg error — fixing pack-metadata + VALOR there yields the largest marginal gain.

---

## Artifacts

| File | Purpose |
|------|---------|
| `variance-matrix.json` | Per-row visible/GT/best/worst/error distribution |
| `root-cause.json` | Verdict, prove matrix, implementation target |
| `cluster-stability.json` | Unified 5-run v27 probe (all 3 rows) |
| `cluster-stability.mts` | Repro script |

**Sources:** `.tmp/gorgonzola-root-cause/`, `.tmp/bresaola-root-cause/`, `.tmp/emporio-final-audit/`, `.tmp/final-residual-error-audit/`, `.tmp/emporio-discount-column-audit/`, `.tmp/column-shift-audit/`
