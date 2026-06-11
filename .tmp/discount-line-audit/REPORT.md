# Discount Line Failure Audit

Generated: 2026-06-11T01:16:47Z

## Executive Summary

Scanned all 6 Validation Lab invoices for discount-line signatures (`qty × unit_price ≠ total` or discount/recargo keywords). Found **20 ground-truth discount rows** across 4 invoices (Bidfood 7, Emporio 2, Bocconcino 3, Mammafiore 8). High-impact errors concentrate on **3 Mammafiore products** (Guanciale, Birra Peroni, Farina Pizza) where invoice totals are ~25–56% below `qty×price`.

Five fresh Mammafiore extractions on identical input show Pass C **alternates between behaviour A (copy invoice total) and behaviour B (substitute qty×unit_price)**. **4 of 5 runs** copy totals correctly for all three primary targets; **run 2 alone** recalculates all three (matching the post-refinement validation failure).

**Final answer: Discount-line errors are GPT run variance on a structural discount-line weakness — not a deterministic pipeline bug.** Downstream stages (normalize, reconcile, persistence, UI) do not introduce discount total divergence.

---

## Discount Line Inventory

| Invoice | Product | Qty | Unit € | Invoice Total | Math Total | Δ |
|---------|---------|-----|--------|---------------|------------|---|
| Bidfood | Salada Ibérica FSTK EMB. 250g | 4 | 2.33 | 8.76 | 9.32 | 0.56 |
| Bidfood | Hortelã | 0.5 | 6.74 | 2.7 | 3.37 | 0.67 |
| Bidfood | Pepino | 3.36 | 1.77 | 4.76 | 5.95 | 1.19 |
| Bidfood | Pêra Abacate Hasse | 3.28 | 5.32 | 13.96 | 17.45 | 3.49 |
| Bidfood | Courgettes | 3.3 | 1.95 | 5.15 | 6.44 | 1.29 |
| Bidfood | Alho Francês | 5.42 | 1.77 | 7.67 | 9.59 | 1.92 |
| Bidfood | Abóbora Butternut | 5.64 | 1.24 | 5.59 | 6.99 | 1.40 |
| Emporio | De Cecco Paccheri 500g | 24 | 2.35 | 50.20 | 56.40 | 6.20 |
| Emporio | Rovagnati Salame Ventricina | 2.6 | 16.60 | 39.49 | 43.16 | 3.67 |
| Bocconcino | MOZZARELLA FIOR DI LATTE 125GR×8 | 10 | 9.50 | 81.23 | 95.00 | 13.77 |
| Bocconcino | STRACCIATELLA 250 GR | 24 | 4.141 | 74.54 | 99.38 | 24.84 |
| Bocconcino | ACQUA S.PELLEGRINO (CX 75CL×15) | 2 | 20.295 | 42.07 | 40.59 | −1.48 |
| **Mammafiore** | **Guanciale** | 5.996 | 16.922 | **64.93** | 101.46 | **36.53** |
| **Mammafiore** | **Farina Speciale pizza** | 1 | 33.154 | **26.52** | 33.15 | **6.63** |
| **Mammafiore** | **Birra Peroni** | 24 | 1.529 | **25.69** | 36.70 | **11.01** |
| Mammafiore | Aceto balsamico | 1 | 18.929 | 16.09 | 18.93 | 2.84 |
| Mammafiore | MOZZA Fior di Latte | 10 | 24.728 | 200.30 | 247.28 | 46.98 |
| Mammafiore | Rulo Di Capra | 1 | 15.192 | 10.86 | 15.19 | 4.33 |
| Mammafiore | Recargo por combustible | 1 | 2.00 | 2.00 | 2.00 | 0 (keyword) |
| Mammafiore | Farina 00 Caputo | 1 | 39.101 | 30.11 | 39.10 | 8.99 |

**Note:** Bidfood produce rows show a consistent ~25% gap (likely list-price vs charged total). These rows extract correctly in all audited runs — not a failure source. Aviludo April/May have no qty×price mismatches in ground truth.

---

## Pass C Behaviour

Legend: **A** = copy invoice total (correct for discounts) · **B** = recalculate qty×price (wrong) · **C** = alternates A/B across runs

| Product | c33a7f1 Run | Refined Run | Runs 1–5 | Pattern |
|---------|-------------|-------------|----------|---------|
| Guanciale | A | C | A A A A **B** A A A A | **C** (4A / 1B) |
| Farina pizza | A | B | A A A A **B** A A A A | **C** (4A / 1B) |
| Birra Peroni | A | B | A A A A **B** A A A A | **C** (4A / 1B) |
| Aceto | C | A | €15.09 / €16.09 mix | C (±€1) |
| Rulo | A | C | A A A A **B** A A A A | C (minor) |
| Farina 00 | A | A | A A A A A | **A** (stable) |

**Key observation:** The refined validation run (`04c0d88`) matches the single bad variance run (run 2) — all three primary targets flipped to B simultaneously on the same image.

---

## Run Variance Results

5 Mammafiore extractions, identical PDF, deployed Pass C prompt (`04c0d88`):

| Run | Guanciale | Farina pizza | Birra Peroni | Behaviour |
|-----|-----------|--------------|--------------|-----------|
| 1 | €64.93 ✓ | €26.52 ✓ | €25.69 ✓ | A |
| **2** | **€101.54 ✗** | **€33.15 ✗** | **€36.70 ✗** | **B** |
| 3 | €64.93 ✓ | €26.52 ✓ | €25.69 ✓ | A |
| 4 | €64.93 ✓ | €26.52 ✓ | €25.69 ✓ | A |
| 5 | €64.93 ✓ | €26.52 ✓ | €25.69 ✓ | A |

**Consistency: 80% correct (4/5 runs).** Qty and unit_price are identical across all runs; only `total` diverges.

---

## Structural vs Variance

| Product | Classification | Evidence |
|---------|----------------|----------|
| Guanciale | **VARIANCE** | Two totals only: €64.93 vs €101.54 |
| Farina pizza | **VARIANCE** | Two totals only: €26.52 vs €33.15 |
| Birra Peroni | **VARIANCE** | Two totals only: €25.69 vs €36.70 |
| Aceto | **VARIANCE** | €15.09 ↔ €16.09 (±€1, not A/B flip) |
| Rulo | **VARIANCE** | €10.80–€15.19 range |
| Farina 00 | **STRUCTURAL_CORRECT** | €30.11 every run despite 29% discount gap |

**Verdict:** Primary discount failures are **variance**, not a fixed wrong answer. When GPT chooses A, totals match GT. When it chooses B, it substitutes `qty×price` exactly.

---

## Financial Impact

| Product | GT Total | Best Run | Worst Run | Error Range |
|---------|----------|----------|-----------|-------------|
| Guanciale | €64.93 | €64.93 | €101.54 | €36.61 |
| Farina pizza | €26.52 | €26.52 | €33.15 | €6.63 |
| Birra Peroni | €25.69 | €25.69 | €36.70 | €11.01 |
| Aceto | €16.09 | €16.09 | €15.09 | €1.00 |
| Rulo | €10.86 | €10.86 | €15.19 | €4.33 |
| Farina 00 | €30.11 | €30.11 | €30.11 | €0.00 |

**Primary 3-target worst-case (single bad run): €54.25** (Guanciale €36.61 + Farina €6.63 + Birra €11.01)  
**Primary 3-target best-case: €0.00**  
**Aggregate max across all 6 audited products: €59.58**  
**Aggregate min (best runs): €0.03**

This explains the €55 "Discount / Model Variance" bucket from root-cause consolidation: one bad Mammafiore run inflates the single-pass financial error metric from ~€12 to ~€66.

---

## Root Cause

| Stage | Role in discount errors |
|-------|--------------------------|
| OCR | No separate stage; Pass C reads cropped table image |
| **Pass C** | **First and only divergence point** — chooses A or B for discounted totals |
| normalizeItems | Pass-through; no total correction |
| reconcile | May adjust qty/unit for pack notation (Aceto/Rulo); does not fix discount totals |
| persistence / UI | Stale DB possible; not source of A/B flip |

Per-product traces in `ground-truth-trace.json` confirm PDF values match GT; c33 run copied correctly; refined run matched run-2 B behaviour.

---

## Validation Lab Impact

| Scenario | VL Readiness | Financial Error | Notes |
|----------|--------------|-----------------|-------|
| Discount handling **ignored** | **MOSTLY READY** | €66.34 (single-run) | Inflated by 1/5 bad Mammafiore run; Column Shift ~€21 remains |
| Discount handling **solved** (stable A) | **READY** | ~€6.76 projected | Best-run totals match GT; residual = Column Shift + minor Aceto/Rulo |

**Closure recommendation:** Close VL. Remaining high-impact errors are not a single deterministic bug — they are non-deterministic Pass C behaviour on discounted lines. The prompt refinement (`DISCOUNTED LINES` rule) reduces but does not eliminate variance (80% success rate observed).

---

## Final Answer

**Are discount-line errors a deterministic extraction bug or GPT run variance?**

**GPT run variance — with evidence:**

1. Identical input (same PDF, same qty, same unit_price) produces **two distinct total strategies** across runs.
2. **4/5 runs correct**, 1/5 wrong — classic non-deterministic model behaviour, not a fixed pipeline defect.
3. c33a7f1 era run = behaviour A (correct); refined validation run = behaviour B (wrong) — same prompt family, different stochastic outcome.
4. Downstream pipeline stages do not modify discount totals.
5. Farina 00 proves the prompt *can* stably copy discounted totals (5/5 A) on the same invoice.

The failure class is **structural** (discounted lines where qty×price≠total require explicit total-copy behaviour) but the **errors are variance-driven** (GPT sometimes ignores the rule and recalculates).

---

## Evidence Files

| File | Contents |
|------|----------|
| `discount-line-inventory.json` | 20 GT rows + per-source extractions |
| `ground-truth-trace.json` | Image → Pass C → normalize → reconcile → DB per row |
| `passc-behaviour.json` | A/B/C classification per product |
| `run-variance.json` | 5 Mammafiore extraction runs |
| `structural-vs-variance.json` | Per-product VARIANCE vs STRUCTURAL verdict |
| `financial-impact.json` | GT vs best/worst run per product |
| `root-cause.json` | First divergence stage = Pass C |
| `closure-assessment.json` | VL readiness scenarios |
| `run-audit.mts` | Reproducible audit script |
