# Monetary Column Validation Strategy Audit

Generated: 2026-06-11

## Executive Summary

Evaluated whether **deterministic post-Pass C validation** can detect monetary column mis-selection without fixing extraction. Tested 6 rules (A–F) against **22 historical misread field values** and **32 correct VL rows** (Bidfood, Aviludo May, Emporio/Bocconcino excluding target products).

**Finding:** Marginly can **partially** auto-detect column-shift errors — **75% of historical error runs flagged (9/12 YES)** — but **cannot reliably eliminate the failure class**. Three stable error patterns evade all rules, including the **refined-validation Prosciutto extract (€9.17 × 4 = €36.54)** and **Pomodor list-price read (€27.56, total €54.20)**. Rule A and D produce **37.5% false positives** on legitimate discount lines.

**Final answer:** Wrong column selection is **not fundamentally indistinguishable** — many misreads are arithmetically inconsistent or match discount-column values — but **self-consistent wrong extractions (qty×unit=total) are indistinguishable from correct without column metadata beyond the GPT triple.**

---

## Historical Misreads

**22 field-level misreads** catalogued (`monetary-misreads.json`).

| Invoice | Product | Example wrong values | Source column |
|---------|---------|---------------------|---------------|
| Emporio | Prosciutto | unit €17.00, €10.17, €9.17 | Desc.(%) 17,50; Preço Unit 10,30; total÷qty |
| Emporio | Prosciutto | total €36.54 (vs GT €35.14) | Preço Total (visible invoice) |
| Bocconcino | POMODOR | unit €20.00, €27.56, €25.90 | DESC 20%; P.VENDA 27,560 |
| Bocconcino | POMODOR | total €40, €54.20, €20.02 | calculated; DESC bleed |

---

## Rule Detection Results

| Rule | Definition | Errors caught | False positives |
|------|------------|---------------|-----------------|
| **A** | qty × unit_price ≈ total | 7/12 | **12/32** |
| **B** | unit_price ≈ discount % column | 3/12 | **0/32** |
| **C** | unit_price ≈ VAT % | 0/12 | 0/32 |
| **D** | unit_price > plausible net (total÷qty) | 5/12 | **10/32** |
| **E** | unit matches neighbour row, math fails | 2/12 | 0/32 |
| **F** | discount column present (context) | — | — |

### Per-run detection (12 historical error extractions)

| Run | Invoice | unit € | total € | Detected? | Triggering rules |
|-----|---------|--------|---------|-----------|------------------|
| 1 | Prosciutto | 10.17 | 36.54 | **YES** | A, D |
| 2 | Prosciutto | 8.20 | 35.24 | **NO** | — (near-correct) |
| 3 | Prosciutto | 17.00 | 36.54 | **YES** | A, B, D |
| 4 | Prosciutto | 8.17 | 36.54 | **YES** | A |
| 5 | Prosciutto | 8.20 | 36.54 | **YES** | A |
| refined | Prosciutto | 9.17 | 36.54 | **NO** | — (arithmetically consistent) |
| 1 | Pomodor | 20.00 | 40.00 | **YES** | B |
| 2 | Pomodor | 27.56 | 54.20 | **NO** | — (within tolerance) |
| 3 | Pomodor | 25.90 | 40.00 | **YES** | A, D |
| 4 | Pomodor | 27.56 | 42.20 | **YES** | A, D, E |
| 5 | Pomodor | 27.56 | 20.02 | **YES** | A, D, E |
| refined | Pomodor | 20.00 | 40.00 | **YES** | B |

**Undetected (NO):** Prosciutto run 2 (near-GT), Prosciutto refined stable (9.17/36.54), Pomodor run 2 (27.56/54.20).

---

## False Positive Analysis

Tested **32 correct rows** from Bidfood (11), Aviludo May (8), Emporio (6 non-Prosciutto), Bocconcino (5 non-Pomodor).

| Metric | Value |
|--------|-------|
| Rows tested | 32 |
| False flags | **12 (37.5%)** |
| Rule A FP | 12 |
| Rule D FP | 10 |
| Rule B FP | 0 |

**All false positives are legitimate discount lines** where qty × unit_price ≠ total by design (Mozzarella €9.50×10≠€81.23, Emporio De Cecco, Bidfood produce rows). Rule A alone cannot distinguish discount lines from column-shift errors without discount-column context.

---

## Coverage Scores

| Metric | Value |
|--------|-------|
| Historical error runs | 12 |
| Detected (YES) | 9 (75%) |
| Undetected (NO) | 3 (25%) |
| False positive rate | 37.5% on correct rows |
| Best single rule | **B** (0 FP, catches discount-as-price) |
| Worst single rule | **A** (12 FP, unusable alone) |

**Optimal combination:** B + E + scoped A (only when discount column absent) → catches Pomodor €20 and neighbour-shift €27.56; misses arithmetically-consistent errors.

---

## Structural Feasibility

| Question | Verdict |
|----------|---------|
| Can monetary-column family be reduced via post-Pass C validation? | **MEDIUM confidence** |
| Enough info in GPT triple alone? | **NO** — Rule B needs discount % value not in Pass C output |
| Enough info with template flags + neighbour rows? | **PARTIAL** — 75% detection, 37.5% FP without discount exemption |

**Blockers:**
1. Self-consistent misreads (2×€20=€40; 4×€9.17≈€36.54) pass all arithmetic rules
2. Legitimate discount lines fail the same rules as column-shift errors
3. Post-Pass C validator does not know which invoice column was read

---

## Validation Lab Impact

| Metric | Baseline (refined) | With validator (estimated) |
|--------|-------------------|---------------------------|
| Field Accuracy | 91.8% | ~93.5% |
| Financial Accuracy | 96.96% | ~98.5% |
| Financial Error € | 66.34 | ~45 |
| Column-shift residual € | ~21.4 | ~6–10 (unflagged stable errors) |

Assumes flagged rows trigger human review or re-extract — **does not auto-correct extraction**.

**VL readiness:** MEDIUM improvement — majority of column-shift runs flaggable, but stable refined-validation errors and discount-line false positives prevent full automation.

---

## Final Answer

**Can Marginly automatically detect wrong monetary column selection?**

**PARTIALLY YES — with important limits.**

| Detectable | Not detectable |
|------------|----------------|
| Discount % read as unit price (€20 = DESC 20%) | Arithmetically self-consistent misreads (2×20=40) |
| Discount % as Prosciutto unit (€17 ≈ 17,50%) | Refined Prosciutto (€9.17×4≈€36.54) |
| qty×unit ≠ total when no discount | List-price read within tolerance (€27.56, €54.20) |
| Neighbour column bleed (€27.56 = Mezzi row) | Near-correct extractions (€8.20, €35.24) |

**Are errors fundamentally indistinguishable from correct extractions?**

**NO for ~75% of error runs** — they violate arithmetic or match known discount-column magnitudes.

**YES for ~25%** — including the **production refined-validation failure modes** — where GPT produces internally consistent triples that mirror correct discounted-line patterns.

Deterministic validation is a **useful safety net** (especially Rule B for discount-as-price) but **cannot eliminate** the monetary column selection failure class without either (a) extracting discount-column values in a prior pass, or (b) accepting false positives on legitimate discount lines.

---

## Artifacts

- `monetary-misreads.json` — Task 1
- `candidate-analysis.json` — Task 2
- `rule-testing.json` — Task 3
- `detection-power.json` — Task 4
- `false-positive-analysis.json` — Task 5
- `coverage-score.json` — Task 6
- `feasibility.json` — Task 7
- `closure-impact.json` — Task 8
- `run-audit.mts` — reproducible generator
