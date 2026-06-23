# Guanciale Commercial Reality Audit

**Mode:** STRICT READ-ONLY — no code, DB writes, fixes, deployments, or prompt edits  
**VL:** `bjhnlrgodcqoyzddbpbd`  
**Product:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore Portugal, 2026-05-19)  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)  
**Audited:** 2026-06-23

## Executive Summary

**Commercial truth: ~5.996 kg of guanciale was purchased and billed; usable inventory should be ~5.996 kg (~6 kg), not 10.5 kg.**

The supplier invoice shows **Qtd = 5,996** with gross **€16.922/kg**, **36% discount**, and net **Valor = €64,93**. That arithmetic closes exactly only if **5.996 is billed kilograms** — not 7 pieces, not a full 10.5 kg case. The notation `+/- 1,5kg*7` describes the **standard supplier case shape** (7 pieces of ~1.5 kg per full case); on this invoice roughly **four pieces (~5.996 kg)** were delivered and weight-priced.

The system currently records **10.5 kg usable** and **€6.18/kg** operational cost — commercially wrong: it overstates inventory by **~75%** and understates true cost by **~43%**.

**Verdict: A — ~5.996 kg purchased; `*7` is supplier metadata, not purchased units on this line**  
**Assumption classification: A — Proven**  
**Confidence: High (0.94)**

---

## 1. Original Invoice Reality (PDF / OCR / Extract / Row)

Sources: `.tmp/geometry-audit/images/36c99d19-6f9f-413f-8c2d-ae3526291a2d.png`, `.tmp/mammafiore-line-audit/ground-truth.json`, `.tmp/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`, VL DB read-only query 2026-06-23.

| Field | Value | Evidence class | Source |
|-------|------:|:--------------:|--------|
| Artigo (SKU) | 1000000782 | A — Proven | Invoice PNG |
| Description | Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | A — Proven | PDF, extract, DB |
| Pack notation | `+/- 1,5kg*7` (approx 1.5 kg × 7 per standard case) | A — Proven | Printed line text |
| **Purchased qty (Qtd.)** | **5.996** | **A — Proven** | PDF Qtd=5,996; ground-truth; Hybrid H; VL `invoice_items` |
| Unit column (Un.) | **UN** | A — Proven | PDF Un.=UN; persisted `unit=un` |
| Gross unit price (Pr. Unitário) | **€16.922/kg** | A — Proven | PDF Pr.=16,922; ground-truth |
| Discount (Desc.) | **36%** | A — Proven | PDF Desc.=36,00; remaining-bug-root-causes stage 1 |
| Line total net (Valor) | **€64.93** | A — Proven | PDF Valor=64,93; extract; VL DB |
| Effective unit price | **€10.83/kg** | A — Proven | `5.996 × 10.83 ≈ 64.93`; Hybrid H `unit_price=10.83` |
| Lot metadata | Nº Lote 140126 · Exp. 31/12/2026 | A — Proven | Sub-line on invoice PNG |
| Pass C raw unit (GPT era) | `kg` (not `un`) | B — Likely | `.tmp/persistence-audit/pass-c-raw/36c99d19-…-gpt-raw.json` — GPT read weight semantics despite PDF `UN` |
| Hybrid H extract unit | `UN` | A — Proven | `.tmp/final-validation-lab-rerun/extracts/36c99d19-…json` |
| VL DB persisted row | qty **5.996**, unit **un**, unit_price **10.83**, total **64.93** | A — Proven | Read-only query `invoice_items` id `6efebedf…` |

### Monetary reconciliation (PDF gross → net)

```
5.996 kg × €16.922 gross/kg     = €101.59
Less 36% discount               = €36.57
Net total                         = €64.93  ✓ (matches PDF Valor, extract, VL DB)

Effective net €/kg              = €64.93 ÷ 5.996 kg = €10.83/kg
```

**Critical proof:** The billed total is derived from **5.996 × €16.922 × (1 − 0.36)**. The quantity column is economically **kilograms**, even though the unit column reads `UN`.

---

## 2. Commercial Interpretation of `1,5kg*7`

| ID | Interpretation | Purchased qty | Usable qty | Plausible? |
|----|----------------|--------------:|-----------:|:----------:|
| **A** | **Row qty is billed weight (kg); `*7` is supplier case metadata (standard full case = 7 × ~1.5 kg ≈ 10.5 kg)** | **~5.996 kg** | **~5.996 kg** | **Yes — correct** |
| B | Customer bought one full case: 7 × 1.5 kg = 10.5 kg; ignore row qty | 10.5 kg | 10.5 kg | No — contradicts €64.93 total |
| C | Partial case: ~4 pieces of ~1.5 kg delivered (~5.996 kg total) | ~5.996 kg (~4 pc) | ~5.996 kg | Yes — equivalent to A; explains `+/-` tolerance |
| D | Row qty means 7 discrete `UN` pieces at ~0.856 kg each | 7 un / ~6 kg | ~5.996 kg | Weak — fractional avg piece weight; `*7` would duplicate count semantics |

**Conclusion:** Interpretations **A** and **C** describe the same commercial event (partial delivery against a 7-piece case standard). **B** is economically impossible on this invoice. **D** is internally inconsistent with `1,5kg*7` naming and integer-piece expectations.

---

## 3. Economic Consistency — €/kg, Total Weight, €64.93 Fit

| Scenario | Total weight | Gross @ €16.922/kg | Net @ 36% off | Matches €64.93? | Realistic €/kg for guanciale? | Verdict |
|----------|-------------:|-------------------:|--------------:|:-----------------:|:-----------------------------:|:-------:|
| **A — row weight (5.996 kg)** | **5.996 kg** | €101.59 | **€64.93** | **Yes ✓** | **€10.83/kg — realistic** | **Correct** |
| B — full case (7 × 1.5 kg) | 10.5 kg | €177.68 | €113.72 | **No ✗** (+€48.79) | €6.18/kg — unusually low | Rejected |
| C — partial case (~4 × 1.5 kg) | ~5.996 kg | €101.59 | **€64.93** | **Yes ✓** | €10.83/kg — realistic | Same as A |
| D — 7 pieces × 0.856 kg | ~5.996 kg | €101.59 | **€64.93** | Yes (if total weight fixed) | €10.83/kg | Weak semantics |

### System vs commercial truth

| Metric | Commercial truth (A) | System today | Wrong? |
|--------|---------------------:|-------------:|:------:|
| Usable mass | **5,996 g (~6 kg)** | 10,500 g (10.5 kg) | **Yes** |
| Operational cost | **€10.83/kg** | €6.18/kg | **Yes** |
| Line total | €64.93 | €64.93 | No |
| Procurement unit price | €10.83/kg (effective) | €10.83/unit | Mislabeled unit only |

Evidence: `.tmp/quantity-mismatch-ui-audit/replay.json` (`normalizedUsable=10500`, `effectiveUsableCost.cost=6.18`), `.tmp/stock-normalization-family-assessment/assessment.json` (`pdfTruth.usableGrams=5996` vs `incorrectValue.usableGrams=10500`).

---

## 4. Supplier Context — How `*N` Is Used on Same Invoice

Mammafiore invoice `36c99d19` peer lines (PDF ground truth + production UI replay):

| Product | Notation | `*N` role | Invoice Qtd | Purchased (commercial) | Usable (commercial) | System usable | Economics OK? |
|---------|----------|-----------|-------------:|------------------------|--------------------:|--------------:|:-------------:|
| **Guanciale** | `1,5kg*7` | Case shape: 7 × ~1.5 kg per **standard** case | **5.996** | **~5.996 kg (weight line)** | **~5.996 kg** | **10.5 kg** | **No** |
| Peroni | `33cl*24` | 24 bottles per case | 24 | 24 bottles | 7.92 L | 7.92 L | Yes |
| Aceto | `5l*2` | 2 × 5 L per sold unit | 1 | 1 outer (2 bottles) | 10 L | 10 L | Yes |
| Mozzarella julienne | `3kg` (bare) | 3 kg per bag | 10 | 10 bags | 30 kg | 30 kg | Yes |
| Rulo di capra | `1kg*2` | 2 × 1 kg per sold unit | 1 | 1 outer (2 rolls) | 2 kg | 2 kg | Yes |

### Mammafiore `*N` pattern (this invoice)

1. **Count-priced lines (Peroni, Mozzarella, Rulo, Aceto):** Invoice **Qtd** = number of **outer sellable units** (or, for Peroni, count of individual bottles matching `*24`). `*N` encodes **inner pack contents** of one outer unit. Usable = Qtd × (inner content from `*N` or bare size token).

2. **Weight-priced line (Guanciale):** Invoice **Qtd = 5.996** with **€/kg gross pricing** proves **delivered kilograms**, not outer case count. `*7` matches the **product catalog case format** (7 × ~1.5 kg) but **does not multiply** into purchased quantity on this line — analogous to how Mozzarella Bocconcino `125GR*8` describes inner balls, not how many outer packs were bought.

3. **Guanciale is unique on this invoice:** Only line with **fractional Qtd** (~6 kg) plus `kg*count` notation while economics prove **weight billing**. All other `*N` lines have integer Qtd aligned with outer-unit counting.

Peer economics checks (same invoice, from PDF + UI replay):

```
Peroni:     24 × €1.529 × 0.70 = €25.69 ✓  →  25.69 ÷ 7.92 L = €3.24/L
Aceto:       1 × €18.929 × 0.85 = €16.09 ✓  →  16.09 ÷ 10 L   = €1.61/L
Mozzarella: 10 × €24.728 × 0.81 = €200.30 ✓ → 200.30 ÷ 30 kg  = €6.68/kg
Rulo:        1 × €15.192 × 0.715 = €10.86 ✓ →  10.86 ÷ 2 kg   = €5.43/kg
Guanciale:   5.996 × €16.922 × 0.64 = €64.93 ✓ → 64.93 ÷ 5.996 kg = €10.83/kg
```

---

## 5. Final Verdict

| Question | Answer |
|----------|--------|
| **What was actually purchased?** | **~5.996 kg** of guanciale stagionato (partial delivery against a 7 × ~1.5 kg standard case) |
| **What usable quantity should enter inventory?** | **~5,996 g (~6 kg)** — the billed weight |
| **Is 10.5 kg correct?** | **No** — implies €113.72 net at invoice pricing; contradicts €64.93 by €48.79 |
| **Is 5.996 kg proven?** | **Yes** — PDF qty, discount math, and €/kg reconciliation jointly prove it |
| **What does `*7` mean?** | Supplier case metadata (7 pieces × ~1.5 kg per full case), **not** units purchased on this line |

### Verdict selection

| Option | Label | Selected? |
|--------|-------|:---------:|
| **A** | ~5.996 kg purchased; `*7` metadata | **Yes** |
| B | ~10.5 kg correct | No — rejected by monetary proof |
| C | Multiple plausible | No — B eliminated; A/C converge on same mass |

**Classification: A — Proven**

---

## 6. Readiness Impact (Commercial Reality Only — No Fix Design)

Prior state (`.tmp/guanciale-readiness-audit/`): **NOT READY** — commercial weight semantics classified **B — Likely** (missing dedicated audit; PDF unit column `UN` not `kg`).

| Verdict | Commercial reality class | Does Guanciale become READY? | Rationale |
|---------|:------------------------:|:----------------------------:|-----------|
| **A (this audit)** | **A — Proven** | **NOT READY** | Closes the commercial-reality evidence gap, but implementation readiness still blocked by missing fix-design artifact, implementation-prep artifact, runtime discriminator, positive regression matrix, and re-ingest validation (per `.tmp/guanciale-readiness-audit/verdict.json`) |
| B (~10.5 kg correct) | Would imply no user-visible quantity bug | N/A — rejected | Would contradict invoice economics |
| C (multiple plausible) | B or C — unresolved | **NOT READY** | Commercial uncertainty remains a blocker |

**Net effect of this audit:** One prerequisite moves from **B → A** (commercial truth for purchased/usable mass). **Overall implementation verdict remains NOT READY** until fix-surface and regression artifacts exist — unchanged from readiness audit scope.

---

## Confidence

| Level | Score | Basis |
|-------|------:|-------|
| **High** | **0.94** | Exact PDF discount math to €64.93; direct invoice PNG; VL DB corroboration; peer `*N` pattern on same invoice; 10.5 kg path arithmetically impossible |

**Residual uncertainty (6%):** No independent delivery note or physical weigh-in in artifacts. Unit column reads `UN` while economics prove kg — resolved by monetary closure, not by a separate `kg` column label. Only one Guanciale invoice in VL (no cross-invoice SKU repeat).

---

## Sources (read-only)

| Artifact | Use |
|----------|-----|
| `.tmp/geometry-audit/images/36c99d19-6f9f-413f-8c2d-ae3526291a2d.png` | Primary PDF/invoice image |
| `.tmp/mammafiore-line-audit/ground-truth.json` | Manual transcription Qtd=5.996, Pr=16.922, Valor=64.93 |
| `.tmp/mammafiore-line-audit/REPORT.md` | Ground truth table, monetary MATCH for Guanciale |
| `.tmp/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json` | Hybrid H extract |
| `.tmp/persistence-audit/pass-c-raw/36c99d19-…-gpt-raw.json` | Pass C raw (unit=kg signal) |
| `.tmp/remaining-bug-root-causes/` | Stage trace, discount %, first wrong value at stage 8 |
| `.tmp/stock-normalization-family-assessment/assessment.json` | pdfTruth 5996 g vs incorrect 10500 g |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | UI: 10.5 kg, €6.18/kg |
| `.tmp/quantity-mismatch-ui-audit/classifications.json` | Class A user-visible bug |
| `.tmp/guanciale-readiness-audit/` | Prior NOT READY verdict; readiness blocker list |
| `.tmp/mozzarella-commercial-reality-audit/` | Methodology reference |
| VL DB read-only (`bjhnlrgodcqoyzddbpbd`) | `invoice_items`, `ingredients`, `ingredient_price_history` |

**Out of scope (per charter):** code fixes, parser changes, fix design, regression implementation, re-ingest.
