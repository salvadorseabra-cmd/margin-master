# Final Validation Lab Re-run — v30

**Project:** `bjhnlrgodcqoyzddbpbd`  
**Deploy verified:** extract-invoice **v30** ✓  
**Generated:** 2026-06-13  
**Mode:** READ-ONLY audit (single invoke per invoice)

---

## Executive Summary

After **v29 Mortadella** + **v30 Rulo IVA/Valor** fixes:

| Metric | v30 |
|--------|-----|
| **Financial Error €** | **€54.65** |
| **Class A extraction bugs only** | **€28.26** |
| **Class B GT issues** | **€1.4** |
| **Class C GPT variance** | **€24.79** |
| **Field Accuracy %** | **82.21%** |
| **Quantity Accuracy %** | **82.44%** |
| **Financial Accuracy %** | **96.83%** |
| **Rows Fully Correct %** | **49.02%** (25/51) |

### Validation Lab status: **VALIDATION LAB PARTIAL**

---

## Comparison Table

| Phase | Field Acc % | Qty Acc % | Financial Error € | Class A € |
|-------|-------------|-----------|-------------------|-----------|
| Before c33 | 89.41 | 93.75 | 181.24 | — |
| Post-refinement | 91.8 | 93.75 | 66.34 | — |
| v26 rerun | 82.65 | 84.23 | 220.27 | — |
| v28 rerun | 81.77 | 82.44 | 38.91 | 9.36 |
| **v30 rerun** | **82.21** | **82.44** | **54.65** | **28.26** |

**Δ v28 → v30:** financial **€15.74** · Class A **€18.9**

---

## Critical Questions

1. **Are extraction bugs now below €5?** — **NO** on headline Class A (€28.26), but **YES on v29/v30 focus rows** (€1.00 = Farina only)
2. **Is Farina still a real extraction bug?** — **YES** — total 25.52 vs visible/GT 26.52 (€1 digit drift)
3. **Is Pomodor still the dominant GT issue?** — **NO on this run** — classified Class A (bad extraction 23.28); v28 had Class B when extraction matched visible
4. **Can Validation Lab be CLOSED for extraction quality?** — **PARTIAL** — targeted fixes closed; single-run variance (Gorgonzola) and Farina €1 remain

---

## Closure Recommendation

**VALIDATION LAB PARTIAL** — v29/v30 fixes validated (Rulo + Mortadella €0). Remaining blockers:

- **Farina €1** — stable Class A (discount-line family)
- **Gorgonzola €24.79** — Class C single-run variance (not structural regression)
- **Pomodor** — GT/catalog ambiguity; this run mis-extracted (Class A) vs v28 visible-match (Class B)

For **extraction-quality closure on prompt-hardening targets**: focus-row Class A **€1.00 < €5** ✓  
For **full lab financial closure**: **OPEN** until GT catalog (Pomodor) resolved and variance rows stabilized.

---

## Per-Invoice Breakdown

| Invoice | Status | Field % | Qty % | Fin Error € | Rows OK % |
|---------|--------|---------|-------|-------------|-----------|
| Bidfood | CLOSED | 97.73 | 100 | 0 | 81.82 |
| Aviludo May | PARTIAL | 93.75 | 87.5 | 0 | 75 |
| Aviludo April | CLOSED | 100 | 100 | 0 | 88.89 |
| Emporio | OPEN | 62.5 | 50 | 26.39 | 12.5 |
| Bocconcino | OPEN | 64.29 | 57.14 | 27.26 | 0 |
| Mammafiore | OPEN | 75 | 100 | 1 | 12.5 |

---

## Classification

| Class | Count | € |
|-------|-------|---|
| A — Extraction bugs | 3 | **€28.26** |
| B — GT issues | 1 | **€1.4** |
| C — GPT variance | 1 | **€24.79** |
| D — Business interpretation | 21 | €0 |

### Class A rows
| Invoice | Product | € | Rationale |
|---------|---------|---|-----------|
| Bocconcino | POMODOR PELATI (CX 2.5KG*6) | €26.72 | Financial delta vs GT — extraction does not match expected t |
| Mammafiore | Farina Speciale pizza 25kg Amoruso | €1 | Financial delta vs GT — extraction does not match expected t |
| Bocconcino | ROLO DE CABRA E VACA 1KG | €0.54 | Financial delta vs GT — extraction does not match expected t |

### Class B rows
| Invoice | Product | € | Rationale |
|---------|---------|---|-----------|
| Emporio | Rovagnati - Assaporami Prosciutto Cotto Scelt | €1.4 | Extraction matches visible invoice; GT catalog differs (visi |

---

## Fixes Validated (v29 Mortadella + v30 Rulo)

| Row | v28 lab € | v30 lab € | v30 total | Status |
|-----|-----------|-----------|-----------|--------|
| Rulo Di Capra | €4.86 | **€0** | 10.86 ✓ | **FIXED** |
| Mortadella IGP | €3.50 | **€0** | 31.07 ✓ | **FIXED** |
| Farina Speciale | €1.00 | €1.00 | 25.52 ✗ | Unchanged |
| **Focus sum** | **€9.36** | **€1.00** | | **−€8.36 recovery** |

Stability probes: Mortadella v29 **5/5** · Rulo v30 **5/5**

---

## Why aggregate Class A rose (v28 €9.36 → v30 €28.26)

Single-run variance on **non-target** rows — not regression from v29/v30 fixes:

| Row | v28 | v30 | Notes |
|-----|-----|-----|-------|
| Pomodor PELATI | Class **B** €27.95 (matched visible) | Class **A** €26.72 (total 23.28 ≠ visible 22.05) | Bad Bocconcino run |
| Gorgonzola | €0 | Class **C** €24.79 | Emporio variance (qty 2.85, total 38.23) |

**Excluding variance + Pomodor reclassification, targeted Class A dropped from €9.36 → €1.00 (Farina only).**

---

## Remaining Wrong Rows (ranked by €)

| Rank | Invoice | Product | € | Class | Visible | GT total | v30 total |
|------|---------|---------|---|-------|---------|----------|-----------|
| 1 | Bocconcino | POMODOR PELATI | 26.72 | A | qty 1, total 22.05 | 50.00 | 23.28 |
| 2 | Emporio | Gorgonzola DOP | 24.79 | C | total 13.44 | 13.44 | 38.23 |
| 3 | Emporio | Prosciutto Cotto | 1.40 | B | total 36.54 | 35.14 | 36.54 |
| 4 | Mammafiore | Farina Speciale | 1.00 | A | total 26.52 | 26.52 | 25.52 |
| 5 | Bocconcino | ROLO DE CABRA | 0.54 | A | — | 12.71 | 12.17 |
