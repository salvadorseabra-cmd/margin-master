# Gorgonzola Root Cause — Emporio Regression (READ-ONLY)

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Row:** Arrigoni Formaggi — Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg  
**Deploy audited:** extract-invoice **v27**  
**Generated:** 2026-06-13

---

## Executive Summary

Gorgonzola’s **€13.56** error on the v27 residual-error audit run is **not a deterministic v27 regression**. It is **GPT run variance at Pass C**: one unlucky draw read qty **2**, unit **€13.50**, and total **€27** (2×13.5) instead of copying visible **Preço Total €13,44**.

Fresh **5-run v27 stability** (same invoice image) shows **4/5 runs at €0** financial error with total **€13.44** correct. v26 and refinement baselines also achieved **€0** on the same row. Ground truth matches the visible invoice.

| Verdict | Confidence | Fix category | Expected improvement |
|---------|------------|--------------|----------------------|
| **B) GPT variance** | **88%** | **prompt** (secondary: binder guard) | **€13.56** on failing runs |

---

## Visible Invoice vs Extracts

From `.tmp/emporio-italia-investigation/invoice-full.png` (row GD87813):

| Field | Visible | GT | Refinement | v26 | v27 audit | v27 stability (4/5) |
|-------|---------|-----|------------|-----|-----------|---------------------|
| Qty | **1,35** kg | 1.35 | 1.35 | 1.26 | **2** | 2–2.6 |
| Preço Unit (gross) | **12,90 €** | — | — | — | — | — |
| Desc.(%) | **22,85** | — | — | — | null | null |
| Unit (net/API) | ~9.92 implied | 9.92 | 9.82 | 10.50 | **13.50** | 9.45–16.55 |
| Preço Total | **13,44 €** | 13.44 | 13.44 | 13.44 | **27.00** | **13.44** |
| **€ error** | — | — | **€0** | **€0** | **€13.56** | **€0** |

Arithmetic check: 1.35 × 12.90 × (1 − 0.2285) ≈ **13.44** — GT and visible align.

---

## Pipeline Trace (Visible → Crop → Pass C → Binder → API)

```
Visible invoice     Crop / geometry        Pass C (GPT)              Binder              API
─────────────────   ────────────────────   ───────────────────────   ────────────────    ─────────────
Qtd 1,35            Table bounds OK        GOOD (majority):          Pass-through        total 13.44
Preço Total 13,44   Desc header clipped    total ← VALOR 13,44        line_total_net      €0 (4/5 runs)
Desc 22,85          Row pixels readable    qty often wrong (2)        unchanged
                                           BAD (audit run):
                                           qty 2, unit 13.5
                                           total 27 = qty×unit  ──►   forwards 27  ──►    €13.56
```

**First failing stage:** **Pass C (`passC_table_extraction`)** — only on bad runs.

Geometry is stable (same bounds as geometry-audit). Binder does not repair a wrong non-null total from Pass C.

---

## What Changed (v26 → v27 audit run)

| Field | v26 / refinement | v27 bad audit run | Financial impact |
|-------|------------------|-------------------|------------------|
| **total** | 13.44 | **27.00** | **€13.56** (primary) |
| quantity | 1.26–1.35 | 2 | Enables wrong synthesis |
| unit_price | 9.82–10.50 | 13.50 | Column misread |

On bad runs GPT **synthesized** total as qty×unit instead of copying **VALOR 13,44**. On good runs (including 4/5 fresh v27 invokes) total stays **13.44** even when qty is still wrong — the same **PARTIAL** pattern documented at v23.

---

## Prove: A / B / C

### A) Deterministic regression — **REJECTED**

- v27 **5-run stability:** 4/5 with total **13.44**, financial error **€0**
- v26 single run: **€0**
- If v27 prompt broke Gorgonzola deterministically, all 5 runs would fail — they do not

### B) GPT variance — **CONFIRMED**

- v23 (`emporio-discount-column-audit`): Gorgonzola **PARTIAL** — total **13.44 stable** 2/2, qty variable (1 or 2)
- v27 audit run: tail failure where **total also broke** (27 = 2×13.5)
- v27 stability run 5: second tail (total **33.14**)
- Product name OCR varies every run (Castelli, Castiglieri, Castelfrigo…) — same instability family as Bresaola/SanPellegrino on Emporio

### C) GT issue — **REJECTED**

- Visible **Preço Total 13,44 €** matches GT **13.44**
- All good extraction paths hit **13.44**

---

## Prompt Attribution (v24–v27)

| Prompt change | Likely caused €13.56? | Notes |
|---------------|----------------------|-------|
| v24 Emporio discount hardening | **No** | Discount column; bad run issue is total synthesis |
| v25 Ventricina hardening | **No** | Different row family |
| v26 Chocolate row isolation | **No** | Adjacent-row bleed; not this failure mode |
| v27 Total column isolation | **No (protective)** | Targets gross→total bleed; 4/5 runs obey it; bad run **violated** it |
| **Other — Emporio weight-row variance** | **Yes** | Long-standing; description `1/8 ~1,5kg` confuses qty; dense table column shift |

The v26→v27 **audit delta** is explained by **run luck**, not by shipping v27 TOTAL COLUMN ISOLATION.

---

## v27 Stability Probe (5 invokes)

Script: `.tmp/gorgonzola-root-cause/v27-stability.mts`  
Results: `.tmp/gorgonzola-root-cause/v27-stability.json`

| Run | Qty | Unit | Total | € err |
|-----|-----|------|-------|-------|
| 1 | 2.6 | 10.22 | 13.44 | 0.00 |
| 2 | 2 | 13.22 | 13.44 | 0.00 |
| 3 | 2 | 9.45 | 13.44 | 0.00 |
| 4 | 2 | 12.20 | 13.44 | 0.00 |
| 5 | 2 | 16.55 | **33.14** | **19.70** |

**Summary:** 4/5 perfect total · avg financial error **€3.94** · not deterministic

---

## Recommendation

**Category: prompt** (88% confidence)

1. Add **Emporio positive example** for fractional kg + Desc.(%) row matching Gorgonzola: Qtd **1,35**, Preço Unit **12,90**, Desc **22,85**, Preço Total **13,44** → `line_total_net: 13.44`.
2. Add **negative example**: when Preço Total prints **13,44**, never emit total **27** from qty **2** × unit **13,50**.
3. Optional **binder** guard: prefer Pass C `line_total_net` when qty×gross diverges sharply (secondary).

**Not recommended:** geometry change, GT change.

**Expected improvement:** **€13.56** recovered when total stabilizes on every invoke; baseline already **80%** at €0 after v27.

---

## Artifacts

| File | Purpose |
|------|---------|
| `stage-trace.json` | Stage-by-stage pipeline trace |
| `root-cause.json` | Structured verdict, prove matrix, fix recommendation |
| `v27-stability.json` | 5-run v27 invoke results |
| `v27-stability.mts` | Repro script |

**Sources:** `.tmp/emporio-final-audit/`, `.tmp/final-residual-error-audit/`, `.tmp/emporio-discount-column-audit/`, `.tmp/column-shift-audit/`, `.tmp/field-accuracy-audit/ground-truth.json`, `invoice-table-extraction.ts` (v26/v27 prompt blocks)
