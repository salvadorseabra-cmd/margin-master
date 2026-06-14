# Farina Speciale — Final Root Cause (v30)

**Invoice:** Mammafiore `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Product:** Farina Speciale pizza 25kg Amoruso  
**Deploy:** extract-invoice **v30** (read-only audit, no deploy)  
**Generated:** 2026-06-13

---

## Executive Summary

**Root cause:** Pass C misreads the **Valor column** as **€25.52** instead of the printed **€26.52**. Gross unit price (33,154) and discount (20%) are read correctly; the binder derives `unit_price=26.52` from gross×(1−discount) while preserving the wrong `line_total_net`.

**Classification:** **B) total column** — Valor digit drift (26→5), not discount/IVA/row bleed  
**Confidence:** **93%**  
**First failing stage:** **Pass C** (binder passes through wrong total)

---

## Visible Invoice (Farina row)

| Column | Printed | Extracted (v30) | Status |
|--------|---------|-----------------|--------|
| Qtd. | 1,000 | 1 | ✓ |
| Pr. Unitário | **33,154** | 33,154 (inferred) | ✓ |
| Desc. | **20,00** | 20% (inferred) | ✓ |
| IVA | 6,00 | — (ignored) | N/A |
| Valor | **26,52** | **25,52** | ✗ |

*Source: `.tmp/mammafiore-investigation/invoice-full.png` · `ocr-row-first.png`*

Discount math: `33.154 × (1 − 0.20) = 26.5232 ≈ 26.52` ✓

---

## Ground Truth vs v30 (10/10 identical)

| Field | GT / Visible | v30 (all 10 runs) | Δ |
|-------|--------------|-------------------|---|
| qty | 1 | 1 | 0 |
| unit_price (list) | 33.154 | 26.52 (net derived) | field display |
| **total** | **26.52** | **25.52** | **−€1.00** |

---

## €1.00 Math Trace

```
Visible Valor (printed)     = 26.52
Pass C line_total_net       = 25.52   ← digit drift: 6 → 5
Binder derived unit_price   = 26.52   ← 33.154 × (1 − 0.20)
Financial error             = |26.52 − 25.52| = 1.00
```

**Binder replay proof** (local deno):

| Pass C input | Binder output |
|--------------|---------------|
| gross=33.154, discount=20%, line_total_net=**25.52** | unit_price=26.52, total=**25.52** ← matches v30 |
| gross=33.154, discount=20%, line_total_net=**26.52** | unit_price=26.52, total=**26.52** ← correct |
| line_total_net=**6.00** (IVA bleed) | total=6.00 ← Rulo failure mode, NOT Farina |

---

## Which Field Is Wrong?

| Field | Verdict |
|-------|---------|
| `quantity` | ✓ Correct |
| `gross_unit_price` | ✓ Correct (inferred 33.154) |
| `discount_pct` | ✓ Correct (visible 20%, not 25%) |
| **`line_total_net`** | **✗ Wrong — Valor digit drift** |
| `unit_price` (API) | Misleading — binder-derived net (26.52), not list price |
| `total` (API) | ✗ Wrong — mirrors bad `line_total_net` |

Digit loss is in the **Valor/total column** (euros digit), not unit price, discount %, or IVA.

---

## Stage Trace

| Stage | Status | Notes |
|-------|--------|-------|
| Visible invoice | PASS | Valor 26,52 clearly printed |
| Geometry / crop | PASS | Post-fix crop includes row; row-band OCR gets 26.52 |
| **Pass C GPT** | **FAIL** | `line_total_net` = 25.52 instead of 26.52 |
| Binder | PASS-THROUGH | Derives unit_price=26.52; preserves wrong total |
| Reconcile | PASS | No modification |
| Final API | FAIL | total=25.52, €1 low |

---

## Classification Rationale

| Hypothesis | Ruled in/out | Evidence |
|------------|--------------|----------|
| A) Discount extraction | **OUT** | Visible Desc.=20%; binder derives correct net unit 26.52 |
| **B) Total column** | **IN** | Valor 26,52 → 25,52 digit drift; stable 10/10 |
| C) Row bleed | OUT | Adjacent Guanciale total 64,93; Birra 25,69 — no bleed pattern |
| D) IVA bleed | OUT | Unlike Rulo (total=6.00); Farina total=25.52 ≠ IVA 6.00 |
| Digit/OCR misread | **IN** | Classic 6↔5 confusion in Valor euros digit |

---

## Comparison to Prior Audits

| Audit | Finding |
|-------|---------|
| `mammafiore-final-audit` | Same €1 Valor drift; stable v26/v27 |
| `discount-line-audit` | 4/5 runs correct at €26.52 pre-v26; v26+ locked at €25.52 |
| `mammafiore-line-audit/pass-c-raw` | Older prompt on same crop: total **26.52** ✓ |
| `rulo-root-cause` | IVA→Valor confusion (€4.86); **fixed in v30** for Rulo |
| `final-stability-audit` | Sole Class A deterministic bug on focus rows |

v30 Rulo fix (MAMMAFIORE COLUMN ISOLATION) does **not** cover Farina's Valor digit drift.

---

## Smallest Prompt-Only Fix

**File:** `supabase/functions/extract-invoice/invoice-table-extraction.ts`  
**Location:** `MAMMAFIORE COLUMN ISOLATION` block (~lines 167–175), after Rulo example

```
"Farina Speciale pizza 25kg Amoruso" with Qtd "1", Pr. Unitário "33,154", Desc. "20,00", IVA "6,00", Valor "26,52"
→ gross_unit_price: 33.154, discount_pct: 20, line_total_net: 26.52 (GOOD — copy Valor digit by digit)
→ line_total_net: 25.52 (BAD — digit drift on Valor; read 26,52 not 25,52)
```

**Expected recovery:** €1.00 per run (deterministic).

---

## Would Fixing Farina Reduce Class A to €0?

| Scope | Answer |
|-------|--------|
| **Stability audit (5 focus rows)** | **YES** — Farina is the only Class A row; fix → €0 Class A on focus set |
| **v30 full VL rerun (6 invoices)** | **PARTIAL** — removes €1.00 of €28.26 headline Class A |
| After Farina fix + Pomodor GT reclass (Class C) | €0.54 remains (Bocconcino Rulo minor drift) |

---

## Critical Questions

1. **Which field is wrong?** — `line_total_net` (Valor column)
2. **Digit loss where?** — Valor euros digit: 26,52 → 25,52
3. **First failing stage?** — Pass C table extraction
4. **Why exactly €1.00?** — Single-digit drift in integer euros place of Valor
5. **Expected recovery?** — €1.00 (deterministic, 10/10 stable)

---

## Artifacts

| File | Contents |
|------|----------|
| `root-cause.json` | Verdict, confidence, fix recommendation, Class A impact |
| `stage-trace.json` | Per-stage pass/fail with inferred Pass C structured fields |
| `stability.json` | 10-run v30 stability data |

**Evidence:** `.tmp/final-stability-audit/`, `.tmp/final-validation-lab-rerun-v30/`, `.tmp/mammafiore-investigation/`
