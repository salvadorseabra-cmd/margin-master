# Emporio Prosciutto v23 Residual Error — Audit Report

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Executive Summary

Emporio Prosciutto remains incorrect on v23 because **GPT Pass C omits `discount_pct`** (visible 17,50%) in structured output. Without discount, the binder uses **gross unit price** as `unit_price` and, when `line_total_net` is also missing, computes **total = qty × gross** — producing inflated totals (€43–46) instead of visible €36,54.

| Question | Answer |
|----------|--------|
| Root cause | **GPT extraction** — `discount_pct` not populated |
| First deviation stage | **Pass C structured output** |
| Geometry | PASS — not responsible |
| Binder | Works when structured complete; **cannot derive net without discount** |
| Confidence | **88%** |
| MCB closed except Prosciutto? | **PARTIAL** |

---

## References

### Visible invoice (source image)

| Field | Value |
|-------|-------|
| Qty | 4,30 |
| Preço Unit. | 10,30 € |
| Desc.(%) | 17,50 |
| Preço Total | **36,54 €** |

### VL Ground Truth

| Field | Value |
|-------|-------|
| qty | 4.3 |
| unit_price (net) | 8.17 |
| total | 35.14 |

*VL GT total is €1.40 below visible Preço Total — catalog definition gap, predating v23.*

### Historical baselines

| Stage | qty | unit | total | Pattern |
|-------|-----|------|-------|---------|
| Pre-Hybrid 5-run | 4–4.3 | 8.17–17.00 | 35.24–36.54 | DESC bleed / gross / net |
| Refined Pass C | 4 | 9.17 | 36.54 | total÷qty after rounding |
| v22 (not re-tested) | 4 | 9.17 | 36.54 | prior audit |
| **v23 (this audit)** | 4.3 | 10.22–10.76 | 36.44–46.27 | gross unit; inflated total |

---

## v23 Live Invokes (3 runs + prior validation)

Deployment: **v23** @ `4afc87a5…`

| Run | qty | unit_price | total | qty×unit | vs visible €36.54 |
|-----|-----|------------|-------|----------|-------------------|
| 1 | 4.3 | 10.56 | 36.44 | 45.41 ≠ | **−€0.10** |
| 2 | 4.3 | 10.70 | 46.01 | 46.01 ✓ | **+€9.47** |
| 3 | 4.3 | 10.22 | 43.95 | 43.95 ✓ | **+€7.41** |
| v23 validation | 4.3 | 10.76 | 46.27 | 46.27 ✓ | **+€9.73** |

- **Not deterministic** — 3 distinct unit/total pairs (unlike Pomodor v23)
- **Structured fields:** not in API (stripped by design)
- **Quantity:** correct on all runs (4.3)

---

## Stage trace

```
Geometry crop     ✅ PASS — headers visible (top 456, headerTop 466)
       ↓
Pass C GPT        ❌ FAIL — discount_pct null; gross ~10.3; line_total_net intermittent
       ↓
parseMonetary     ✅ preserves fields
       ↓
bindMonetary      ⚠️ PARTIAL — gross→unit when discount null; qty×gross→total when net null
       ↓
reconcile         ✅ no change
       ↓
API output        ❌ unit gross; total variable
```

### Which values are wrong?

| Field | Status |
|-------|--------|
| quantity | ✅ Correct (4.3) |
| gross_unit_price | ⚠️ Minor OCR drift (10.22–10.76 vs 10.30) |
| **discount_pct** | ❌ **Missing/null** (should be 17.5) |
| line_total_net | ⚠️ Intermittent (36.44 when read; null on worst runs) |
| **unit_price** | ❌ Gross not net (should be ~8.50) |
| **total** | ❌ Inflated when net null (€43–46) |

---

## Binder simulation proof

Local simulation matches live v23 runs exactly:

| Scenario | GPT input | Binder output | Matches live |
|----------|-----------|---------------|--------------|
| gross only, no discount, no net | gross 10.7, disc null, net null | unit 10.7, total **46.01** | **Run 2** ✓ |
| gross + net, no discount | gross 10.56, disc null, net 36.44 | unit 10.56, total **36.44** | **Run 1** ✓ |
| all structured correct | gross 10.3, disc 17.5, net 36.54 | unit **8.50**, total 36.54 | — (GPT doesn't do this) |

**Conclusion:** Binder logic is correct when GPT supplies all structured fields. Failure is upstream `discount_pct` omission.

---

## Root cause

**GPT Pass C does not reliably extract `discount_pct` from the Desc.(%) column** on Emporio's dense 4-column monetary cluster (`4,30 | 10,30€ | 17,50 | 36,54€` in 286px).

Contributing factors (from `column-selection-deep-dive`):
- Discount column **lacks % symbol** on Emporio (unlike Bocconcino DESC 20,00%)
- Four right-aligned numerics in close proximity
- Historical pattern: unit shifts among gross (10.30), discount (17.50), and net (8.17)

v23 structured schema **removed legacy `total` field** — when GPT also omits `line_total_net`, the binder invents total as `qty × gross`, **worsening** the prior ~€1.40 residual to **€7–11** on bad runs.

---

## Financial delta (€)

| Reference | Best (run 1) | Worst (run 2) | Prior refined |
|-----------|--------------|---------------|---------------|
| vs visible total €36.54 | −0.10 | +9.47 | +0.00 |
| vs VL GT total €35.14 | +1.30 | +10.87 | +1.40 |
| vs VL GT unit €8.17 | +2.39 | +2.53 | +1.00 |

---

## Issue type classification

| Layer | Verdict |
|-------|---------|
| OCR | N/A (GPT vision = OCR) |
| **GPT extraction** | **PRIMARY** — discount_pct omission |
| Binder | SECONDARY — amplifies when discount null |
| Ground Truth | Separate €1.40 catalog gap (visible vs VL GT) |

---

## Can Monetary Column Binding be CLOSED except Prosciutto?

### **PARTIAL**

| Row | Status | Notes |
|-----|--------|-------|
| Bocconcino Pomodor | PARTIAL | Net €22.05 matches visible; VL GT qty mismatch separate |
| **Emporio Prosciutto** | **OPEN** | discount_pct omission; variable €7–11 total error |
| Emporio other rows | NOT_RETESTED | — |
| Full family | NOT CLOSED | Prosciutto + Pomodor GT gaps remain |

Hybrid H pipeline (Phase 1–3 + v23 schema) **fixes the extraction contract** but **does not fix Emporio discount-column reading**. Prosciutto needs either:
1. Improved Pass C prompt/examples for discount columns without % symbol, or
2. Row-level retry when `discount_pct` null but gross and total present, or
3. Rule detecting gross unit + qty×gross ≠ line_total_net mismatch

---

## Artifacts

| File | Contents |
|------|----------|
| `stage-trace.json` | Per-stage status + live runs |
| `root-cause.json` | Verdict + financial deltas |
| `REPORT.md` | This report |

---

## Confidence: 88%

- Live v23 invokes + binder simulation match (high)
- No raw GPT JSON logged (8% uncertainty on exact structured field values)
