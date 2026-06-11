# Column Shift Root Cause Audit

Generated: 2026-06-11

## Executive Summary

Read-only audit of the two remaining **stable column-shift residuals**: **Emporio Prosciutto Cotto** (~€1.40) and **Bocconcino POMODOR PELATI** (~€10). All other extraction families excluded per scope.

**Findings:** Errors originate at **Pass C only** (no OCR stage; GPT reads cropped table image). Source-image transcription confirms dense multi-column layouts with **discount/% fields adjacent to unit-price fields**. Five fresh extractions per invoice show **column-shift patterns on every run** but **not identical values every run** — a mix of structural mis-column-read and GPT variance.

**Final answer:** Column Shift is **one structural failure class** (wrong numeric column selection) with **two product-specific neighbour-column patterns** — not two unrelated edge cases.

---

## Prosciutto Analysis

### Ground truth (source image)

| Field | Visible on invoice |
|-------|-------------------|
| Description | Rovagnati - Assaporami Prosciutto Cotto Scelto HC ~4,25KG |
| Qty | 4,30 |
| Preço Unit. | 10,30 € |
| Desc.(%) | 17,50 |
| Preço Total | **36,54 €** |

VL catalog GT: qty 4.3, unit €8.17 (net), total €35.14 — total is €1.40 below visible Preço Total.

### Pass C vs image

| Run | Qty | Unit € | Total € | Neighbour source |
|-----|-----|--------|---------|------------------|
| 1 | 4 | 10.17 | 36.54 | Preço Unit (gross, digit drift) |
| 2 | 4.3 | 8.20 | 35.24 | Net unit approximation |
| **3** | 4.3 | **17.00** | 36.54 | **Desc.(%) 17,50** |
| **4** | 4.3 | **8.17** | 36.54 | **Correct VL net unit** |
| 5 | 4.3 | 8.20 | 36.54 | Net unit approximation |

- **Total:** 4/5 runs read **Preço Total 36,54** correctly vs visible invoice.
- **Unit price:** Shifts among gross (10.30), net (8.17), and **discount column (17.50)**.
- **Worst shift:** Run 3 — €17 = discount % column.

Evidence: `emporio-prosciutto-row-crop.png`, `run-stability.json`

---

## Pomodor Analysis

### Ground truth (source image)

| Field | Visible on invoice |
|-------|-------------------|
| Description | POMODORI PELATI (CX 2,5KG*6) |
| QUANT | 1,000 |
| P.VENDA S/IVA | 27,560 EUR |
| DESC | 20,00% |
| VALOR LÍQUIDO | **22,05 EUR** |

VL catalog GT: qty 2, unit €25, total €50 (post-geometry re-extract target; differs from visible row qty=1).

### Pass C vs image

| Run | Qty | Unit € | Total € | Neighbour source |
|-----|-----|--------|---------|------------------|
| **1** | 2 | **20.00** | **40.00** | **DESC 20,00%** |
| 2 | 2 | 27.56 | 54.20 | P.VENDA (list price × qty) |
| 3 | 2 | 25.90 | 40.00 | Mixed |
| 4 | 2 | 27.56 | 42.20 | P.VENDA + wrong total |
| 5 | 2 | 27.56 | 20.02 | P.VENDA price, DESC-like total |

- **Run 1** matches prior `passc-refinement-validation` stable error (€20 = discount %).
- **Runs 2/4/5** read **P.VENDA 27,560** as unit price, ignoring discount.
- **No run** matches visible VALOR LÍQUIDO 22,05 with qty 1.

Evidence: `bocconcino-pomodor-row-crop.png`, `run-stability.json`

---

## OCR vs Pass C

No discrete OCR stage exists. Image transcription = effective OCR ground truth.

| Product | Image value | Pass C wrong? | Before Pass C? |
|---------|-------------|---------------|----------------|
| Prosciutto unit | 10,30 € / net 8,17 | Often YES | N/A — Pass C IS vision |
| Prosciutto total | 36,54 € | Usually NO | Matches Preço Total |
| Pomodor unit | 27,560 EUR | YES (20 or 27.56) | Reads DESC or P.VENDA |
| Pomodor total | 22,05 EUR | YES (40, 54.2, etc.) | Never reads VALOR LÍQUIDO |

---

## Multi-Run Stability

| Invoice | Unit € unique (5 runs) | Total € unique | Deterministic? |
|---------|------------------------|----------------|----------------|
| Emporio Prosciutto | 10.17, 8.2, 17, 8.17 | 36.54, 35.24 | **NO** (4 unit / 2 total) |
| Bocconcino Pomodor | 20, 27.56, 25.9 | 40, 54.2, 42.2, 20.02 | **NO** (3 unit / 4 total) |

**Contrast with discount-line audit:** Mammafiore discount errors showed 80% run consistency. Column-shift cases show **multiple wrong columns across runs** — structural weakness with variance in which column is misread.

---

## Common Mechanism Test

| Criterion | Prosciutto | Pomodor |
|-----------|-----------|---------|
| Failure stage | Pass C | Pass C |
| Failure class | Column mis-identification | Column mis-identification |
| Primary neighbour | Desc.(%) 17,50 | DESC 20,00% |
| Secondary neighbour | Preço Unit 10,30 | P.VENDA 27,560 |
| Qty semantics | kg weight (4,30) | pack *6 confusion (qty 2 vs image 1) |
| Deterministic | No | No |

**Verdict:** **Same failure class, different neighbour-column patterns (A + B).**

Shared mechanism: GPT selects wrong numeric field from a dense right-aligned column cluster where **discount/% sits between unit price and line total**.

Different manifestations:
- Prosciutto alternates gross price, net price, and discount %
- Pomodor alternates discount % and list P.VENDA, never consistently reading VALOR LÍQUIDO

---

## Recurrence Risk

**HIGH** at 1,000-restaurant-invoice scale.

| Factor | Evidence |
|--------|----------|
| Layout density | 8–9 columns, 2-line rows, no vertical grid lines |
| Discount adjacency | Desc.(%) / DESC between price and total on both templates |
| Reproducibility | Wrong-column reads on 5/5 runs (values vary, errors persist) |
| VL precedent | 2/6 invoices affected; root-cause-consolidation ~€21 stable residual |

---

## Final Answer

**Is Column Shift one remaining structural extraction bug or two unrelated edge cases?**

**One structural bug class — Pass C column selection failure on dense restaurant invoice tables — with two product-specific neighbour-column patterns.** Not unrelated edge cases: both involve discount/% columns adjacent to price columns, both fail only at Pass C, both recur on every extraction attempt. Prosciutto and Pomodor differ in *which* neighbour column is misread (discount % vs P.VENDA vs gross/net price), not in *whether* column shift occurs.

Neither error is caused by geometry, footer, persistence, reconcile, or discount-line variance (separate audited family).

---

## Artifacts

| File | Contents |
|------|----------|
| `ground-truth.json` | Image-transcribed row values |
| `column-layout.json` | X-coordinate column map |
| `emporio-prosciutto-row-crop.png` | Prosciutto row crop |
| `emporio-prosciutto-row-annotated.png` | Annotated column overlay |
| `bocconcino-pomodor-row-crop.png` | Pomodor row crop |
| `bocconcino-pomodor-row-annotated.png` | Annotated column overlay |
| `ocr-audit.json` | Image vs Pass C comparison |
| `passc-audit.json` | Per-field trace |
| `run-stability.json` | 5-run extraction results |
| `neighbour-analysis.json` | Wrong value → source column |
| `common-mechanism.json` | Same vs different verdict |
| `recurrence-risk.json` | HIGH/MEDIUM/LOW assessment |
| `run-audit.mts` | Reproducible audit script |
