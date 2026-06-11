# Column Selection Failure Deep Dive

Generated: 2026-06-11

## Executive Summary

Deep-dive on **why Pass C mis-selects monetary columns** for Emporio Prosciutto and Bocconcino POMODORI PELATI. Analysis uses row crops, simulated Pass C table crops, header strips, and 5-run stability data from `.tmp/column-shift-audit/`.

**Key finding:** The crop is **not fundamentally ambiguous on Bocconcino** — headers, `EUR`, and `%` symbols give enough visual information for a human. GPT still misreads the discount column as unit price. On **Emporio**, the geometry table crop **clips column headers**, and the discount column lacks a `%` symbol — creating genuine visual ambiguity. Failure mechanism is **Mixed (E): column proximity + vision model limitation + header clipping (Emporio only)**.

**Fixability:** **MEDIUM confidence** the error class can theoretically be eliminated; **MARGINAL** overall visual sufficiency because Emporio crop lacks headers.

---

## Prosciutto Analysis

### Column reconstruction (image only)

| Column | Header | Value | X range |
|--------|--------|-------|---------|
| codigo | Código | UO502 | 0–52 |
| lotes | Lotes/Séries | 03-12-2026 | 52–108 |
| designacao | Designação | Rovagnati… ~4,25KG | 108–392 |
| imposto | Imposto | IVA23 | 392–438 |
| qty | Qtd. | **4,30** | 438–478 |
| unit_price | Preço Unit. | **10,30 €** | 478–548 |
| discount_pct | Desc.(%) | **17,50** | 548–612 |
| line_total | Preço Total | **36,54 €** | 612–724 |

Four monetary-looking values in 286px: `4,30` | `10,30 €` | `17,50` | `36,54 €`

### Pass C choice patterns (5 runs)

| Run | Unit € | Mapped column | Total € | Mapped column |
|-----|--------|---------------|---------|---------------|
| 1 | 10.17 | Preço Unit (gross) | 36.54 | Preço Total ✓ |
| 2 | 8.20 | derived/net | 35.24 | derived |
| 3 | **17.00** | **Desc.(%) 17,50** | 36.54 | Preço Total ✓ |
| 4 | **8.17** | net (correct) | 36.54 | Preço Total ✓ |
| 5 | 8.20 | derived/net | 36.54 | Preço Total ✓ |

**Pattern:** Total column read correctly 4/5 runs. Unit price shifts among gross price, discount %, and net — **column proximity + missing % on discount field**.

---

## Pomodor Analysis

### Column reconstruction (image only)

| Column | Header | Value | X range |
|--------|--------|-------|---------|
| referencia | REFERÊNCIA | VG0026 | 0–72 |
| descricao | DESCRIÇÃO | POMODORI PELATI (CX 2,5KG*6) | 72–292 |
| qty | QUANT. | **1,000** | 292–358 |
| cxs | CXs | (blank) | 358–392 |
| unit | UNI | UNI | 392–424 |
| unit_price | P.VENDA S/IVA | **27,560 EUR** | 424–518 |
| discount_pct | DESC | **20,00%** | 518–578 |
| line_total | VALOR LIQUIDO | **22,05 EUR** | 578–668 |
| vat | IVA | 23% | 668–752 |

### Pass C choice patterns (5 runs)

| Run | Unit € | Mapped column | Total € | Mapped column |
|-----|--------|---------------|---------|---------------|
| 1 | **20.00** | **DESC 20,00%** | 40.00 | calculated 2×20 |
| 2 | 27.56 | P.VENDA S/IVA | 54.20 | calculated 2×27.56 |
| 3 | 25.90 | mixed | 40.00 | calculated |
| 4 | 27.56 | P.VENDA S/IVA | 42.20 | calculated |
| 5 | 27.56 | P.VENDA S/IVA | 20.02 | DESC bleed |

**Pattern:** Never reads VALOR LÍQUIDO 22,05. Alternates discount-as-price vs list-price-as-unit-price.

---

## Header Visibility

| Column | Emporio (Pass C crop) | Bocconcino (Pass C crop) |
|--------|----------------------|--------------------------|
| Quantity | **cropped** | visible (QUANT.) |
| Unit price | **cropped** | visible (P.VENDA S/IVA) |
| Discount | **cropped** | visible (DESC) |
| Line total | **cropped** | visible (VALOR LIQUIDO) |

Emporio geometry crop starts at y=456; headers sit at y≈430 (`emporio-probe-430.png`). Bocconcino crop at y=433 includes full header row (`bocconcino-table-crop-simulated.png`).

**Additional Emporio ambiguity:** Desc.(%) shows `17,50` without `%` — visually identical format to a euro amount.

---

## Pass C Choice Patterns

Across 10 field outputs (5 runs × 2 products):

| Source column | Times selected as unit_price | Times selected as total |
|---------------|------------------------------|-------------------------|
| Desc.(%) / DESC | 2 (Prosciutto r3, Pomodor r1) | 1 (Pomodor r5) |
| Preço Unit / P.VENDA | 4 | 0 |
| Preço Total / VALOR | 0 | 5 (Prosciutto totals) |
| calculated | 4 | 4 (Pomodor) |

GPT **reliably finds the rightmost € total on Emporio** but **cannot consistently anchor unit_price to the EUR-suffixed column**.

---

## Human Readability Assessment

Blind test using **row crop only** (no headers):

| Field | Prosciutto | Pomodor |
|-------|-----------|---------|
| Qty | Easy | Easy |
| Unit price | Moderate (€ cue) | Easy (EUR suffix) |
| Discount | **Hard** (no % symbol) | Easy (% suffix) |
| Total | Easy (rightmost €) | Easy (EUR suffix) |
| Overall | **MARGINAL** | **YES** |

Using **full Pass C table crop:**
- Emporio: **MARGINAL** (headers clipped)
- Bocconcino: **YES** (headers + symbols visible)

A human with Bocconcino crop alone can identify all four fields. GPT cannot.

---

## Failure Mechanism

**Classification: E — Mixed**

| Mechanism | Weight | Evidence |
|-----------|--------|----------|
| **B — Column Proximity** | HIGH | 3–4 numeric columns within ~130–160px |
| **D — Vision Model Limitation** | HIGH | Bocconcino has headers; GPT still picks DESC as price |
| **A — Header Ambiguity** | MEDIUM | Emporio crop clips headers |
| **C — Crop Too Tight** | LOW | Full horizontal width preserved |
| **E — Mixed** | — | Combined above |

---

## Fixability Assessment

| Question | Answer |
|----------|--------|
| Can error class be eliminated? | **MEDIUM confidence** — theoretically yes |
| Enough info in crop? | **MARGINAL overall** — YES (Bocconcino), MARGINAL (Emporio) |
| Blockers | Model ignores EUR/% anchors; Emporio headers clipped; prompt example mismatches visible Pomodor row |

---

## Final Answer

**Does Pass C have enough visual information to reliably identify the correct monetary column, or is the crop fundamentally ambiguous?**

**It depends on the invoice — not universally ambiguous, not universally sufficient:**

1. **Bocconcino:** The crop is **NOT fundamentally ambiguous**. Headers (`P.VENDA S/IVA`, `DESC`, `VALOR LIQUIDO`), `EUR` suffixes, and `%` symbols provide unambiguous column identity. A human identifies all fields correctly from the row crop alone. **GPT failure is a vision model limitation (D)**, not missing visual information.

2. **Emporio:** The crop is **partially ambiguous**. Pass C table crop **excludes column headers**, and the discount field (`17,50`) lacks a `%` symbol — making it visually indistinguishable from a price. Humans rely on position + € symbols + arithmetic; without headers this is **MARGINAL**. **GPT failure combines header clipping (A), column proximity (B), and model limitation (D).**

3. **Cross-cutting:** Pass C prompt already mandates column-faithful extraction and includes a POMODOR example — yet the model violates these rules. The structural bug is **eliminable in principle** (MEDIUM confidence) because Bocconcino proves sufficient visual discriminators exist; **Emporio requires header inclusion in crop** for reliable column binding.

**Bottom line:** The remaining structural extraction bug is **not caused by fundamentally ambiguous crops on all invoices** — it is caused by **GPT failing to exploit available column anchors**, compounded on Emporio by **header clipping and discount format ambiguity**.

---

## Artifacts

| File | Purpose |
|------|---------|
| `column-reconstruction.json` | Task 1 — full column map |
| `monetary-candidates.json` | Task 2 — monetary values per row |
| `passc-choice-map.json` | Task 3 — GPT output → source column |
| `header-visibility.json` | Task 4 — header visibility per crop type |
| `crop-context.json` | Task 5 — horizontal context assessment |
| `human-simulation.json` | Task 6 — blind human identification |
| `failure-mechanism.json` | Task 7 — A/B/C/D/E classification |
| `fixability-assessment.json` | Task 8 — elimination confidence |
| `emporio-table-crop-simulated.png` | Simulated Pass C input (Emporio) |
| `bocconcino-table-crop-simulated.png` | Simulated Pass C input (Bocconcino) |
| `run-audit.mts` | Reproducible artifact generator |
