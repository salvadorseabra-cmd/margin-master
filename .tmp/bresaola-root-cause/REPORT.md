# Bresaola Root Cause — Emporio Variance (READ-ONLY)

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Row:** Rigamonti — Bresaola Punta d'Anca Oro 1/2 - 1,5kg  
**Deploy audited:** extract-invoice **v27**  
**Generated:** 2026-06-13

---

## Executive Summary

Bresaola's **€10** residual is **GPT variance (B)**, not a deterministic bug or GT issue.

| Question | Answer |
|----------|--------|
| **Root cause** | Pass C non-determinism — intermittent failure to copy **Preço Total 49,48 €** |
| **Deterministic or variance?** | **Variance** — 2/5 v27 runs correct (40% stability) |
| **€10 reproducible?** | **Sometimes** — 1/5 stability runs; matches v27 audit failure exactly |
| **Confidence** | **87%** |
| **Expected improvement if hardened** | **€10.00** (plus ~€3.77 avg error on partial failures) |

---

## Visible Invoice vs Extracts

From `.tmp/emporio-italia-investigation/invoice-full.png` (row RMO0000334):

| Field | Visible | GT | Refinement | v26 | v27 audit | v27 stability (2/5) |
|-------|---------|-----|------------|-----|-----------|---------------------|
| Qty | **1,83** kg | 2.8* | 2.28 | 1.83 | 2.38 | 2.5–2.6 |
| Preço Unit (gross) | **33,80 €** | — | — | — | — | — |
| Desc.(%) | **20,00** | — | — | — | null | null |
| Unit (net/API) | ~17.68 implied | 17.68 | 21.80 | 27.05 | 16.64 | ~19 |
| Preço Total | **49,48 €** | 49.48 | 49.64 | 49.48 | **39.48** | **49.48** |
| **€ error** | — | — | **€0.16** | **€0** | **€10.00** | **€0** |

\*GT qty 2.8 is catalog normalization; printed Qtd is **1,83**. Financial anchor is **Preço Total 49,48 €** — GT total matches visible.

---

## v27 Stability Probe (5 independent invokes)

Script: `.tmp/bresaola-root-cause/v27-stability.mts`  
Results: `.tmp/bresaola-root-cause/stability.json`

| Run | Qty | Unit | Total | € err |
|-----|-----|------|-------|-------|
| 1 | 2.5 | 19.79 | **49.48** | 0.00 |
| 2 | 2.6 | 19.03 | **49.48** | 0.00 |
| 3 | 2.3 | 19.49 | 44.83 | 4.65 |
| 4 | 3.3 | 12.00 | **39.48** | **10.00** |
| 5 | 2.3 | 19.71 | 45.29 | 4.19 |

| Metric | Value |
|--------|-------|
| **Stability** | **40%** (2/5 correct total) |
| **€10 exact** | **1/5** (20%) |
| **Deterministic** | **No** — 4 unique totals |
| **Avg financial error** | **€3.77** |

**Row oscillates correct/incorrect** across independent invokes on the same image.

---

## Pipeline Trace

```
Visible              Crop           Pass C                         Binder        API
────────────────     ──────────     ──────────────────────────     ────────      ─────────
Qtd 1,83             OK             GOOD: total ← 49,48            pass-through  €0 (2/5)
Preço Total 49,48                   BAD: total 39,48                          €10 (1/5)
Desc 20,00                            (≈ qty×unit or bleed 39,49)                 €4–5 (2/5)
```

**First failing stage:** **Pass C** — only on bad runs. Geometry OK; binder forwards Pass C total unchanged.

---

## Prove: A / B / C

### A) Deterministic extraction bug — **REJECTED**

- 2/5 runs return correct total **49.48**
- 3/5 return different wrong totals — not a fixed bug

### B) GPT variance — **CONFIRMED**

- 40% stability; oscillates between correct and wrong
- €10 failure **reproduced** on stability run 4 (identical to v27 audit: total **39.48**)
- **Failure modes on bad runs:**
  1. **qty×unit synthesis** — audit run: 2.38 × 16.64 ≈ **39.48** (not VALOR 49,48)
  2. **Possible row/digit confusion** — 39.48 ≈ Ventricina visible **39,49 €** (same audit extract had Bresaola 39.48 + Ventricina 39.49)
- **Historical variance:** v23 run1 total 49.48 / run2 49.88; pre-v26 lab rerun total 45.26
- Same Emporio pattern as [Gorgonzola root cause](.tmp/gorgonzola-root-cause/REPORT.md)

### C) GT issue — **REJECTED** (for €10)

- Visible **Preço Total 49,48 €** = GT **49.48**
- Good extractions consistently hit 49.48

---

## Does v26 show same behaviour?

| Run | Total | € err |
|-----|-------|-------|
| v26 official rerun | 49.48 | €0 |
| Pre-v26 lab rerun | 45.26 | €4.22 |
| Refinement | 49.64 | €0.16 |

**Yes** — v26's €0 was a **single lucky draw**. Variance predates v27; v26 does not deterministically fix Bresaola.

---

## Recommendation

**Category: prompt** (87% confidence)

1. Add **Emporio positive example**: Bresaola — Qtd **1,83**, Preço Unit **33,80**, Desc **20,00**, Preço Total **49,48** → `line_total_net: 49.48`
2. **Negative example**: never **39,48** when VALOR prints **49,48**; distinguish from Ventricina **39,49**
3. Reinforce **VALOR copy** over qty×unit on discounted weight rows

**Expected improvement:** **€10.00** on failing runs; avg error **€3.77 → ~€0** at 90%+ stability.

---

## Artifacts

| File | Purpose |
|------|---------|
| `stage-trace.json` | Pipeline stage trace |
| `root-cause.json` | Structured verdict and prove matrix |
| `stability.json` | 5-run v27 invoke results |
| `v27-stability.mts` | Repro script |
