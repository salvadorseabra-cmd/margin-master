# Emporio Final Audit — v27 Residual Errors

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)  
**Deploy:** extract-invoice **v27**  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Executive Summary

Emporio v27 financial error on four focus rows totals **€29.04** (100% classified as **extraction bugs**). All failures originate at **Pass C** — no binder or reconcile normalization issues observed. Two rows (Gorgonzola, Bresaola) are **GPT run regressions** where prior v26/refinement runs achieved correct line totals.

| Row | € error | Class | First failing stage |
|-----|---------|-------|-------------------|
| Gorgonzola | **€13.56** | A | Pass C |
| Bresaola | **€10.00** | A | Pass C |
| SanPellegrino | **€4.70** | A | Pass C |
| Mortadella | **€0.78** | A | Pass C |
| **Sum** | **€29.04** | | |

*Emporio invoice total on v27 is €30.44; remaining €1.40 is Prosciutto (GT mismatch — out of scope).*

---

## Methodology

- **v27 extraction:** `.tmp/final-residual-error-audit/extracts/17aa3591-....json` (fresh v27 invoke)
- **GT:** `.tmp/field-accuracy-audit/ground-truth.json`
- **Visible values:** column-shift-audit, emporio-discount-column-audit, ventricina-root-cause, passc-refinement-validation, prosciutto-v23-audit
- **Baselines:** v26 final-validation-lab rerun, passc-refinement reextract

---

## Row 1 — Gorgonzola (€13.56) — Class A

### Visible invoice
| Field | Value | Source |
|-------|-------|--------|
| Qty | **1,35** kg | passc-refinement, emporio-footer-fix, discount-accuracy |
| Preço Total | **€13,44** | Stable across good runs (v23 PARTIAL 2/2) |
| Unit (net) | ~€9,82–9,92 | Variable; discount implied |

### Ground truth
qty 1.35 · unit €9.92 · total **€13.44**

### v27 extraction
qty **2** · unit €13.50 · total **€27.00**

### Baseline comparison
| Run | Qty | Total | € err |
|-----|-----|-------|-------|
| v27 | 2 | €27.00 | **€13.56** |
| v26 | 1.26 | €13.44 | €0 |
| Refinement | 1.35 | €13.44 | €0 |

### Verdict
**Extraction bug — GPT run regression.** Doubled quantity and misread Preço Total. Not a GT issue (GT matches visible total). **First failure: Pass C.**

---

## Row 2 — Bresaola (€10.00) — Class A

### Visible invoice
| Field | Value | Source |
|-------|-------|--------|
| Qty | ~2,28–2,80 kg | Weight row; qty/unit trade when total correct |
| Preço Total | **€49,48** | v23 run1, v26, GT |

### Ground truth
qty 2.8 · unit €17.68 · total **€49.48**

### v27 extraction
qty 2.38 · unit €16.64 · total **€39.48**

### Baseline comparison
| Run | Qty | Total | € err |
|-----|-----|-------|-------|
| v27 | 2.38 | €39.48 | **€10.00** |
| v26 | 1.83 | €49.48 | €0 |
| Refinement | 2.28 | €49.64 | €0.16 |

### Verdict
**Extraction bug — Preço Total column misread.** v26 preserved total via qty×unit reconciliation (qty 1.83 @ €27.05). v27 lost correct total. **First failure: Pass C.** Not normalization (binder would preserve if Pass C returned correct total).

---

## Row 3 — SanPellegrino (€4.70) — Class A

### Visible invoice
| Field | Value | Source |
|-------|-------|--------|
| Qty | **2,56** cx (GT) / **2** cx (refinement) | Case-weight hybrid |
| Preço Total | **€38,56** | emporio-footer-fix, refinement |

### Ground truth
qty 2.56 · unit €15.06 · total **€38.56**

### v27 extraction
qty **3** · unit €14.42 · total **€43.26**

### Baseline comparison
| Run | Qty | Total | € err |
|-----|-----|-------|-------|
| v27 | 3 | €43.26 | **€4.70** |
| v26 | 2 | €28.50 | €10.06 |
| Refinement | 2 | €38.56 | €0 |

### Verdict
**Extraction bug — qty over-read + wrong total.** Persistent Emporio weakness on beverage case rows (discount-accuracy: qty×unit pattern). Refinement proved €0 reachable. **First failure: Pass C.**

---

## Row 4 — Mortadella (€0.78) — Class A

### Visible invoice
| Field | Value | Source |
|-------|-------|--------|
| Qty | **3,11** kg | ventricina-root-cause references |
| Preço Unit (gross) | **€11,10** | ventricina-root-cause |
| Desc.(%) | **10,00** | ventricina-root-cause |
| Preço Total | **€31,07** | ventricina-root-cause |

### Ground truth
qty 3.11 · unit €10.10 (net) · total **€31.07**

### v27 extraction
qty 3.1 · unit €9.77 · total **€30.29**

### Baseline comparison
| Run | Qty | Total | € err |
|-----|-----|-------|-------|
| v27 | 3.1 | €30.29 | **€0.78** |
| v26 | 3.11 | €30.74 | €0.33 |
| Refinement | 3.11 | €31.07 | €0 |
| v25 best | 3.11 | €31.00 | €0.07 |

### Verdict
**Extraction bug — discount column failure.** Same structural family as Prosciutto/Ventricina (emporio-discount-column-audit): `discount_pct` not extracted; binder applies qty×gross → total €30.29 vs visible €31.07. **First failure: Pass C** (discount_pct null). Binder amplifies but does not originate error. **Not Class C** — Pass C output is already wrong.

---

## Classification Summary

| Class | Rows | € | Notes |
|-------|------|---|-------|
| **A) Extraction bug** | 4 | **€29.04** | All Pass C |
| B) GT issue | 0 | €0 | (Prosciutto €1.40 separate) |
| C) Normalization | 0 | €0 | Binder preserves Pass C totals |

**Sum check: €13.56 + €10.00 + €4.70 + €0.78 = €29.04 ✓**

---

## Structural Context

Emporio shares one dense-table failure class across rows:

1. **Column shift** — wrong numeric column in 8-column cluster (Gorgonzola, Bresaola, SanPellegrino)
2. **Discount column** — plain decimal `17,50` / `10,00` without `%`; header clipped from Pass C crop (Mortadella, Prosciutto, Ventricina)

Prosciutto and Ventricina are **fixed or €0** on v27 this run; Mortadella remains partial (€0.78).

---

## Stability Notes

| Row | v27 | Historical best | Deterministic? |
|-----|-----|-----------------|----------------|
| Gorgonzola | BAD (€13.56) | €0 (v26, refinement) | **NO** |
| Bresaola | BAD (€10.00) | €0 (v26 total) | **NO** |
| SanPellegrino | €4.70 | €0 (refinement) | **NO** |
| Mortadella | €0.78 | €0 (refinement) | **PARTIAL** |

Gorgonzola and Bresaola errors on v27 are **run regressions**, not new structural bugs — prior audits achieved correct totals on the same PNG.

---

## Projected Outcome If Fixed

| Scope | Financial € |
|-------|-------------|
| Four focus rows fixed | **€0** |
| Full Emporio (incl. Prosciutto GT) | **€1.40** |

---

## Artifacts

| File | Contents |
|------|----------|
| `row-breakdown.json` | Per-row visible/GT/v27/baseline comparison |
| `classification.json` | A/B/C taxonomy + structural families |
| `REPORT.md` | This report |
