# Rulo Di Capra Residual Error — Root Cause (v29)

**Invoice:** Mammafiore `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Product:** Rulo Di Capra 1kg*2 Simonetta  
**Deploy audited:** extract-invoice **v29** on `bjhnlrgodcqoyzddbpbd`  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Executive Summary

**Root cause:** Pass C reads the **IVA column (6,00)** as `line_total_net` instead of the **Valor column (10,86)**. The €4.86 residual is exactly `10.86 − 6.00`.

**Classification:** **B) total column** (primary) · **D) GPT variance** (secondary — 1/5 v29 runs correct)  
**Confidence:** **92%**  
**First failing stage:** **Pass C** (binder/reconcile pass through unchanged)

---

## Visible Invoice (Rulo row)

| Column | Printed value |
|--------|---------------|
| Qtd. | 1,000 |
| Un. | UN |
| Pr. Unitário | **15,192** |
| Desc. | **28,50** |
| IVA | **6,00** |
| Valor | **10,86** |

*Source: `.tmp/mammafiore-investigation/invoice-full.png` · corroborated by `mammafiore-line-audit/REPORT.md`*

Discount math checks: `15.192 × (1 − 0.285) ≈ 10.86` ✓

---

## Ground Truth vs v28/v29 Extraction

| Field | GT | v28 lab | v29 typical (4/5 runs) |
|-------|-----|---------|------------------------|
| qty | 1 | 1 ✓ | 1 ✓ |
| unit_price | 15.192 (list) | 10.86 | 10.86 |
| total | **10.86** | **6.00** ✗ | **6.00** ✗ |
| Financial error | — | **€4.86** | **€4.86** |

GT `unit_price` is list/gross (15.192). Extracted `unit_price` is the net/discounted amount (10.86) — a field display mismatch with **€0 financial impact** when Valor is correct.

---

## €4.86 Math Trace

```
GT Valor (visible)     = 10.86
Extracted total        =  6.00  ← matches IVA column, NOT Valor
Financial error        = |10.86 − 6.00| = 4.86
```

When wrong, extracted total **always equals IVA 6,00** (v29: 4/5 runs `ivaColumnBleed=true`).

---

## Version Behaviour

| Source | Rulo total | € error | Notes |
|--------|------------|---------|-------|
| v26 lab rerun | 10.86 | €0 | Correct Valor |
| v27 lab rerun | 10.86 | €0 | Correct Valor |
| v27 residual audit | 6.00 | €4.86 | IVA bleed (regression) |
| v28 lab rerun | 6.00 | €4.86 | Unchanged |
| v29 stability (5-run) | 6 / 10.86 | avg €3.89 | **1/5 correct**, 4/5 IVA bleed |
| discount-line 5-run (older) | €10.80–€15.19 | ≤€0.06–€4.33 | Mostly behaviour A; €6 mode rare pre-v27 residual |

v29 Mortadella hardening did **not** affect this row — no Mammafiore IVA/Valor prompt exists today.

---

## Stage Trace

| Stage | Status | Notes |
|-------|--------|-------|
| **Pass C** | **FAIL** | `line_total_net` = IVA 6,00 instead of Valor 10,86 |
| Monetary binder | Pass-through | Maps `line_total_net` → `total` |
| Line reconcile | Pass-through | No correction |
| API strip | Pass-through | Returns total 6 |

---

## Classification Rationale

| Code | Verdict | Why |
|------|---------|-----|
| **A) discount** | Rejected | Desc. 28,50 not extracted, but €4.86 = Valor−IVA, not discount math failure |
| **B) total column** | **Primary** | `line_total_net` taken from IVA (6) not Valor (10.86) |
| **C) row bleed** | Rejected | Wrong value is same-row IVA cell, not neighbour Valor |
| **D) GPT variance** | Secondary | 20% v29 success (1/5); failure mode deterministic when wrong |

---

## v29 Stability Probe (5 runs)

| Run | total | unit_price | € err | IVA bleed? |
|-----|-------|------------|-------|------------|
| 1 | 6.00 | 10.86 | 4.86 | yes |
| 2 | **10.86** | 10.86 | 0.00 | no |
| 3 | 6.00 | 10.86 | 4.86 | yes |
| 4 | 6.00 | 10.86 | 4.86 | yes |
| 5 | 6.00 | 10.86 | 4.86 | yes |

**Summary:** 1/5 correct (20%) · 4/5 IVA bleed · avg €3.89  
*Artifact: `stability.json`*

Image: `.tmp/mammafiore-investigation/invoice-full.png` (single `data:image/png;base64,` prefix).

---

## Recommended Prompt-Only Fix

**File:** `supabase/functions/extract-invoice/invoice-table-extraction.ts`  
**Location:** After existing Rulo pack-notation example (~lines 163–165), before Baladin Ginger Beer block.

**Smallest change:** Add **MAMMAFIORE COLUMN ISOLATION** block:

```
Pr. Unitário | Desc. | IVA | Valor → gross_unit_price | discount_pct | (ignore IVA) | line_total_net

"Rulo Di Capra 1kg*2 Simonetta" Qtd "1", Pr. Unitário "15,192", Desc. "28,50", IVA "6,00", Valor "10,86"
→ gross_unit_price: 15.192, discount_pct: 28.5, line_total_net: 10.86 (GOOD)
→ line_total_net: 6.00 (BAD — copied IVA; NOT Valor 10,86)
```

**Expected recovery:** **€4.86** per corrected run (currently ~80% failure rate → ~€3.89 avg recoverable on this row).

---

## Artifacts

| File | Contents |
|------|----------|
| `REPORT.md` | This report |
| `root-cause.json` | Structured verdict, math trace, fix recommendation |
| `stage-trace.json` | Pass C → binder → reconcile → API |
| `stability.json` | 5-run v29 probe results |
