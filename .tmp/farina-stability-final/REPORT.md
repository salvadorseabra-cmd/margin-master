# Farina Stability Investigation — Final Closure Gate

**Deploy verified:** extract-invoice **v31** on `bjhnlrgodcqoyzddbpbd` (read-only, no deploy)  
**Invoice:** Mammafiore `36c99d19-6f9f-413f-8c2d-ae3526291a2d` — Farina Speciale pizza 25kg Amoruso  
**Method:** 20 independent v31 invokes  
**Image:** `.tmp/geometry-audit/images/36c99d19-6f9f-413f-8c2d-ae3526291a2d.png`  
**Generated:** 2026-06-13

---

## Closure Verdict: **CLOSE EXTRACTION** (90% confidence)

Farina 95% stable on v31 (20-run). Residual 5% is acceptable GPT noise at €0.05 avg.

---

## Stability Summary (20 runs)

| Metric | v30 (10-run) | v31 prior (5-run) | v31 final (20-run) |
|--------|--------------|-------------------|-------------------------|
| Correct vs GT (26.52) | **0/10** (0%) | **3/5** (60%) | **19/20** (95%) |
| Totals seen | [25.52] | [26.52, 25.52] | [26.52,25.52] |
| Avg € error | €1.00 | €0.40 | **€0.05** |
| Classification | A (deterministic) | A→B | **B** (gpt_variance_mostly_fixed) |

---

## Field Diffs: Correct (19) vs Incorrect (1)

| Field | Correct runs | Incorrect runs | Differs? |
|-------|--------------|----------------|----------|
| gross_unit_price | [33.154] | [33.154] | no |
| discount_pct | [20] | [20] | no |
| line_total_net | [26.52] | [25.52] | **YES** |
| unit_price | [26.52] | [26.52] | no |
| total | [26.52] | [25.52] | **YES** |

**Diagnosis:** Only `line_total_net` / `total` differs (Valor digit 26→5). `gross_unit_price`, `discount_pct`, and binder-derived `unit_price` are stable at 33.154 / 20% / 26.52.

---

## Pass C & Binder Analysis

| Question | Answer |
|----------|--------|
| Does Pass C emit 25.52 on incorrect runs? | **YES** — line_total_net=25.52 inferred from API total |
| Does binder modify? | **YES — derives unit_price=26.52, preserves wrong total** |
| unit_price > total signature? | **YES on all incorrect runs** |
| Neighbour row correlation? | **NONE — identical neighbour signatures in correct/incorrect runs** |

---

## Critical Questions

1. **Real bug?** — PARTIAL — intermittent Pass C Valor digit drift, not structural
2. **Pure GPT variance?** — YES — primary cause
3. **Prompt v32 ROI?** — **LOW** (expected ~€0.03 recovery)
4. **Binder safeguard?** — **HIGH** — would recover 1/1 incorrect runs
5. **v32 expected recovery** — best case 97.5% correct, ~€0.03 avg error

---

## Per-Run Results

| Run | gross | disc% | line_total | unit_price | total | unit>total | ✓ |
|-----|-------|-------|------------|------------|-------|------------|---|
| 1 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 2 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 3 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 4 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 5 | 33.154 | 20 | 25.52 | 26.52 | 25.52 | YES | ✗ |
| 6 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 7 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 8 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 9 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 10 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 11 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 12 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 13 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 14 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 15 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 16 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 17 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 18 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 19 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |
| 20 | 33.154 | 20 | 26.52 | 26.52 | 26.52 | no | ✓ |

---

## Artifacts

| File | Contents |
|------|----------|
| `stability-analysis.json` | 20-run matrix, field diffs, neighbour correlation |
| `root-cause.json` | Verdict, Pass C/binder diagnosis |
| `closure-verdict.json` | Final gate decision + critical answers |
| `extracts/` | Per-run raw extracts |
| `run-stability.mts` | Harness script |
