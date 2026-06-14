# Chocolate Pantagruel Column Bleed — Root Cause Audit

**Invoice:** `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` (Aviludo May)  
**Deploy:** extract-invoice **v25**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-12

---

## Executive Summary

Chocolate Pantagruel receives **€9.99** because Pass C GPT copies **Açúcar's Preço Unitário (9,99)** from the row directly below into Chocolate's `gross_unit_price`, then computes total **2 × 9.99 = €19.98** instead of the correct **2 × 29.99 = €59.98**.

**First failing stage:** **Pass C** (GPT table extraction). Crop is fine; binder cannot fix because the wrong triple is arithmetically consistent.

**Stability:** **3/3** v25 probes return unit_price **9.99** — systematic, not run variance.

**Confidence:** 94%

**€ impact:** **€40.00** (sole May error; ~€40 global after April harness fix)

---

## Row Comparison

| Field | Chocolate (visible) | Chocolate (v25) | Açúcar (visible) | Açúcar (v25) |
|-------|--------------------|-----------------|------------------|--------------|
| Qty | 2 CX | 2 CX ✓ | 1 CX | 1 CX ✓ |
| Preço Unit. | **29,99** | **9,99** ❌ | **9,99** | 9,99 ✓ |
| Total | **59,98** | **19,98** ❌ | 9,99 | 9,99 ✓ |
| € error | — | **€40.00** | — | €0 |

The extracted **9.99** is **exactly** Açúcar's unit price — vertical adjacent-row bleed in the dense Aviludo METRO Chef table (29,99 stacked above 9,99 in Preço Unitário column).

---

## Stage Trace

| # | Stage | Chocolate | Diverges? |
|---|-------|-----------|-----------|
| 1 | Visible invoice | Preço **29,99**, Total **59,98** | No |
| 2 | Geometry / crop | Both rows in crop (top 218, bottom 448) | No |
| 3 | **Pass C (GPT)** | gross_unit_price **9.99**, total **19.98** | **Yes — FIRST** |
| 4 | Binder | Passes through; Rule E skipped (2×9.99=19.98 consistent) | Yes (unchanged) |
| 5 | Reconcile | No qty/total correction | Yes |
| 6 | Final API | unit_price 9.99, total 19.98 | Yes |

---

## Isolation Failure Mechanism

**Type:** Adjacent-row **price bleed** (vertical, row-below → row-above)

| Aspect | Açúcar failure (fixed) | Chocolate failure (open) |
|--------|------------------------|--------------------------|
| Field affected | **quantity** | **gross_unit_price** |
| Bleed direction | Price digit → qty (same row) | Entire price → row above |
| Value | Leading **9** from 9,99 | Full **9,99** from Açúcar row |
| Prompt rule | `QUANTITY COLUMN ISOLATION` | **None** |

---

## Why Açúcar Fix Did Not Generalize

The Pass C refinement added:

```
"Açúcar Branco METRO Chef 10x1 Kg" … PREÇO UNITÁRIO "9,99"
→ quantity: 1 (NOT 9 from 9,99, NOT 10 from 10x1)
```

This fixes **qty bleed** (horizontal: price digit entering quantity on the **same row**). It does **not** address:

1. **Price bleed from adjacent row below** onto Chocolate (vertical)
2. **`gross_unit_price` isolation** — rules say "copy digit by digit" but lack "never from neighbour row"
3. **Binder Rule E** — only fires when `qty × unit_price ≠ total`; Chocolate's wrong triple is self-consistent

Açúcar remains correct on v25 (qty 1, €9.99). Chocolate regressed from refinement baseline (29.99/59.98) likely due to v24/v25 Emporio prompt bloat shifting GPT attention on dense Aviludo rows.

---

## v25 Stability (3 runs)

| Run | Chocolate unit_price | Chocolate total | € error |
|-----|---------------------|-----------------|---------|
| 1 | 9.99 | 19.98 | €40 |
| 2 | 9.99 | 19.98 | €40 |
| 3 | 9.99 | 19.98 | €40 |

Açúcar: **1 @ 9.99** in all 3 runs (correct).

---

## Recommended Fix (prompt only)

Add immediately after the Açúcar qty rule in `TABLE_EXTRACTION_SYSTEM_PROMPT`:

**GOOD:** Chocolate Culinaria Pantagruel 10x200g — Qtd 2 CX, Preço Unit **29,99**, Total **59,98** (same row)

**BAD:** gross_unit_price **9,99** borrowed from Açúcar row below

**Generic rule:** `gross_unit_price` and `line_total_net` must come from the **same row's** columns — never from an adjacent line above or below.

---

## Expected Financial Improvement

| Metric | Current | After fix |
|--------|---------|-----------|
| Aviludo May € error | €40.00 | **~€0** |
| Global VL (post-April harness fix) | ~€49 | **~€9** |

---

## Evidence

| File | Contents |
|------|----------|
| `root-cause.json` | Verdict, mechanism, Açúcar gap analysis |
| `stage-trace.json` | Full pipeline trace per stage |
| `v25-chocolate-stability.json` | 3× v25 probe (9.99 stable) |
| `.tmp/aviludo-may-final-audit/` | May error breakdown |
| `.tmp/passc-refinement-audit/pack-notation-audit.json` | Açúcar qty bleed origin |
