# Mozzarella Commercial Reality Audit

**Mode:** STRICT READ-ONLY — no code, DB writes, fixes, deployments, or prompt edits  
**VL:** `bjhnlrgodcqoyzddbpbd`  
**Product:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Audited:** 2026-06-22

## Executive Summary

**Yes — 10 kg is the correct commercial usable quantity.**

The supplier invoice shows **10 outer packs** purchased (QUANT 10,000 / **10 CX**), each pack being **8 × 125 g = 1 kg** of mozzarella. Total delivered mass = **10 × 1 kg = 10 kg (10,000 g)**. The net line total **€81.23** reconciles exactly with 10 packs at gross **€9.50** less **14.5%** discount.

The system currently records **1,000 g (1 kg)** usable — one pack only — while correctly showing **Last Purchase: 10 un**. That is commercially wrong: inventory understates purchased cheese by **9 kg**.

**Assumption classification: A — Proven**  
**Confidence: High (0.95)**

---

## 1. Original Purchase Reality (PDF / OCR / Invoice)

Source: `.tmp/bocconcino-investigation/REPORT.md` (manual OCR of full invoice image), corroborated by `.tmp/field-accuracy-audit/ground-truth.json` and `.tmp/discount-line-audit/ground-truth-trace.json`.

| Field | Value | Evidence |
|-------|-------|----------|
| Supplier reference | QJ0107*8 | OCR product code in invoice header row |
| Description | MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" **125GR*8** | Printed line text |
| Pack structure | 8 balls × 125 g = **1 kg per outer pack** | Standard Italian foodservice notation; `*8` is inner count |
| Invoice quantity | **10** (QUANT 10,000 / **10 CX** / UNI) | OCR quantity columns |
| Gross unit price (P.VENDA) | **€9.500** per pack | OCR |
| Discount (DESC) | **14,50%** | OCR |
| Net line total (VALOR LÍQUIDO) | **€81,23** | OCR + DB + all extracts |

### Pack structure table

| Level | Count | Unit weight | Subtotal mass | Subtotal value (gross) |
|-------|------:|-------------|---------------|------------------------|
| Inner ball | 8 | 125 g | 1,000 g (1 kg) | — |
| Outer pack (sold unit) | 1 | 1 kg | 1,000 g | €9.50 |
| **Invoice line (purchased)** | **10** | 1 kg each | **10,000 g (10 kg)** | €95.00 gross → **€81.23 net** |

### Monetary reconciliation

```
10 packs × €9.50 gross     = €95.00
Less 14.5% discount        = €13.77
Net total                  = €81.23  ✓ (matches invoice, DB, extract)
Net per pack               = €8.123  ≈ €8.12 (bound unit_price in VL extract)
Correct operational cost   = €81.23 ÷ 10 kg = €8.12/kg
```

VL DB `invoice_items` (read-only, 2026-06-22): qty **10**, unit **un**, unit_price **8.12**, total **81.23** — extraction and persistence of **count and money** are correct.

---

## 2. Commercial Interpretation of `125GR*8`

| ID | Interpretation | Plausible? | Verdict |
|----|----------------|------------|---------|
| **A** | **8 mozzarella balls of 125 g each per sold pack (1 kg/pack)** | Yes | **Correct** — matches OCR qty column (10 packs, not 8), reference QJ0107*8, and €/kg economics |
| B | Product weighs 125 g total; `*8` is unrelated noise | No | Contradicted by reference code and standard supplier naming |
| C | Customer bought 8 packs of 125 g (total 1 kg) | No | Invoice QUANT column reads **10**, not 8 |
| D | `*8` is only a SKU suffix, not pack content | Partially | SKU uses *8, but description `125GR*8` also encodes **size × count per pack** |

**Conclusion:** `125GR*8` describes **inner pack geometry** (how much cheese is in one priced outer unit). It does **not** state how many outer packs were purchased — that comes from the **QUANT / CX column (10)**.

---

## 3. Total Mass Scenarios for qty = 10

| Scenario | Formula | Total mass | Matches invoice €? | Verdict |
|----------|---------|------------|-------------------|---------|
| **A** | 10 packs × (8 × 125 g) | **10,000 g (10 kg)** | Yes — €8.12/kg is realistic for fior di latte | **Correct** |
| B | 10 × 125 g (ignore *8) | 1,250 g (1.25 kg) | No — implies €64.98/kg | Rejected |
| C | 10 × 8 = 80 balls × 125 g | 10,000 g (10 kg) | Same as A | Equivalent to A |

Only scenario **A** reconciles quantity, pack notation, and line total.

---

## 4. Cross-Invoice Bocconcino `*N` Notation Consistency

VL contains **one** Bocconcino invoice (`f0aa5a08`). No other `125GR*15` or `125GR*24` Bocconcino lines exist in VL. Cross-line comparison on the **same invoice** is the available evidence set.

| Product | Notation | `*N` role | Invoice qty | Purchased outer units | Inner per outer | Commercial total |
|---------|----------|-----------|------------:|----------------------|-----------------|------------------|
| **Mozzarella** | 125GR**\*8** | 8 × 125 g per pack | 10 | 10 packs | 1 kg | **10 kg** |
| Mezzi Paccheri | CX 1KG**\*6** | 6 × 1 kg per case | 2 | 2 cases | 6 kg | 12 kg |
| Pomodori pelati | CX 2,5KG**\*6** | 6 × 2.5 kg per case | 1 | 1 case | 15 kg | 15 kg |
| S. Pellegrino | CX 75CL**\*15** | 15 × 75 cl per case | 2 | 2 cases | 11.25 L | 22.5 L (see note) |
| Stracciatella | 250 GR (no *N) | 250 g per unit | 24 | 24 cups | 250 g | 6 kg |
| Ricotta | 1,5KG (no *N) | 1.5 kg per unit | 2 | 2 tubs | 1.5 kg | 3 kg |

**Consistent Bocconcino pattern:** `*N` (or `CX … *N`) describes **contents of one sellable outer unit**. The **QUANT column** gives how many outer units were bought. GPT pattern audit (`.tmp/gpt-pattern-audit/multiplier-errors.json`) explicitly marks Mozzarella `125GR*8` as **CORRECT — purchased qty from column, not *8**.

`.tmp/gpt-pattern-audit/multiplier-errors.json` also documents cases where `*N` was **incorrectly** used as purchased qty (e.g. Pomodori GT qty 2 inference) — reinforcing that column qty and `*N` must be kept separate.

---

## 5. Operational Reality — Usable Mozzarella Entered (Invoice Only)

Evidence from `.tmp/quantity-mismatch-ui-audit/replay.json` and `.tmp/quantity-mismatch-validation/mismatches.json` (production-path replay on persisted invoice line; no code changes).

| Field | Invoice commercial truth | System recorded / displayed |
|-------|-------------------------|----------------------------|
| Purchased count | 10 packs | Last Purchase: **10 un** ✓ |
| Unit price (procurement) | €8.12 / pack (net) | **€8.12 / unit** ✓ |
| Line total | €81.23 | €81.23 ✓ |
| **Usable mass** | **10,000 g (10 kg)** | **1,000 g (1 kg)** ✗ |
| Operational cost | **€8.12 / kg** | **€81.20 / kg** ✗ |

Replay math block (`invoiceItemId` `095b2bb9`):

- `normalizedUsable`: **1000 g**
- `purchaseContainerCount`: **8** (inner balls — not outer packs)
- `purchaseQtyForCost`: **1** (one pack treated as entire purchase)
- `effectiveUsableCost`: €81.20/kg (= €81.23 ÷ 1 kg)

The pipeline parsed `125GR*8` as **1 kg per pack** correctly, but applied that mass to **one pack only**, ignoring invoice **qty = 10**.

---

## 6. Assumption Validation — "Usable should be 10 kg"

| Class | Label | Applicable? |
|-------|-------|-------------|
| **A** | **Proven** | **Yes** |
| B | Likely | — |
| C | Unproven | — |
| D | False | — |

**Proof chain:**

1. **OCR** (bocconcino-investigation): QUANT **10,000 / 10 CX** for Mozzarella line.
2. **Money**: 10 × €9.50 × (1 − 14.5%) = **€81.23** net — exact match.
3. **Notation**: `125GR*8` = 8 × 125 g = 1 kg/pack — industry-standard; not contradicted by any source.
4. **Peer control** on same invoice: Stracciatella qty 24 × 250 g → 6 kg usable shown correctly in UI audit.
5. **GPT pattern audit**: qty 10 extracted correctly; `*8` not confused with purchase count.

---

## 7. Final Verdict

| Question | Answer |
|----------|--------|
| **What was purchased?** | 10 outer packs of Mozzarella Fior di Latte Il Bocconcino; each pack = 8 × 125 g (1 kg) |
| **Correct kg entered?** | **No** — system shows **1 kg** usable |
| **Is 1,000 g wrong?** | **Yes** — understates by 9 kg (90%) |
| **Is 10,000 g proven?** | **Yes** — OCR qty, pack notation, and €81.23 total jointly prove 10 kg |
| **Correct operational cost** | **€8.12/kg** (not €81.20/kg) |

### Peer comparison (same invoice f0aa5a08)

| Product | Invoice qty | Expected usable | System usable | Economics correct? |
|---------|------------:|----------------:|--------------:|:------------------:|
| Stracciatella 250 GR | 24 | 6 kg | 6 kg | Yes |
| Ricotta 1,5KG | 2 | 3 kg | 3 kg | Yes |
| Pomodori CX 2,5KG*6 | 1 | 15 kg | 15 kg | Yes |
| S. Pellegrino CX 75CL*15 | 2 | 22.5 L* | 11.25 L | UI audit: OK† |
| **Mozzarella 125GR*8** | **10** | **10 kg** | **1 kg** | **No** |

\*Commercial expectation for 2 cases × 15 × 0.75 L. †Per `.tmp/quantity-mismatch-ui-audit/classifications.json` — classified C (operationally correct per current pipeline rules for case lines). Mozzarella is the outlier: classified **A — confirmed user-visible bug**.

---

## Confidence

| Level | Score | Basis |
|-------|------:|-------|
| **High** | **0.95** | Direct OCR of QUANT 10 / 10 CX; discount math to €81.23; consistent Bocconcino `*N` = inner-pack pattern; Stracciatella control on same invoice; VL DB invoice line matches extract on qty and total |

**Residual uncertainty (5%):** No independent delivery note or physical weigh-in in artifacts — conclusion rests on supplier invoice text and monetary reconciliation only. No `125GR*15` or `125GR*24` Bocconcino SKUs in VL to cross-check alternate pack sizes.

---

## Sources (read-only)

| Artifact | Use |
|----------|-----|
| `.tmp/bocconcino-investigation/REPORT.md` | Primary OCR: QJ0107*8, QUANT 10 / 10 CX, P.VENDA, DESC, VALOR LÍQUIDO |
| `.tmp/field-accuracy-audit/ground-truth.json` | Ground truth row: qty 10, total 81.23 |
| `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` | VL extract: qty 10, €8.12/unit, €81.23 total |
| `.tmp/discount-line-audit/ground-truth-trace.json` | Discount reconciliation: 10 × €9.50 → €81.23 |
| `.tmp/gpt-pattern-audit/multiplier-errors.json` | Confirms qty 10 correct; *8 not purchase count |
| `.tmp/quantity-mismatch-validation/mismatches.json` | usableQuantity 1000 g vs invoice qty 10 |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | UI: 1 kg usable, €81.20/kg |
| `.tmp/quantity-mismatch-ui-audit/classifications.json` | Classification A user-visible bug |
| `.tmp/stock-normalization-family-assessment/assessment.json` | pdfTruth usableGrams 10000 vs incorrect 1000 |
| VL DB `invoice_items` (read-only query) | Persisted: qty 10, total 81.23 |

**Out of scope (per charter):** code fixes, regression analysis, implementation design, schema or prompt changes.
