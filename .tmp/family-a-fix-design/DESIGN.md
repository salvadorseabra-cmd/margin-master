# Family A Fix — Read-Only Design Investigation

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Scope: 51 rows audited, 15 candidates, 2 failures (Mezzi + Ricotta on Bocconcino `f0aa5a08`)

---

### Possible Correction Points

| Stage | What it would do | Risks | Blast radius |
|-------|------------------|-------|--------------|
| **A) Prompt** (`invoice-table-extraction.ts` `TABLE_EXTRACTION_SYSTEM_PROMPT`) | Add or refine Pass C vision instructions for Bocconcino-style rows: undiscounted lines with blank DESC, pack notation in description (`*6`, `1,5KG`), and column-faithful QUANT reading. Existing POMODORI guardrail covers discounted CX+*N rows only. | Prompt edits are non-deterministic; broad pack-notation rules already caused prior regressions (Aceto/Rulo `1→2` in passc-prompt-audit counterfactuals). Over-scoping could re-break Mammafiore `*2` rows or Aviludo `N×SIZE` rows. | **All invoices** through Pass C table extraction (~every upload). |
| **B) Raw GPT validation** | Intercept structured GPT JSON (`quantity`, `gross_unit_price`, `discount_pct`, `line_total_net`) before `bindMonetaryColumns`. Reject or flag rows where quantity appears sourced from description pack multiplier rather than QUANT column. | No such stage exists today. Would require reliable heuristics without visible-column OCR fallback. False rejects on legit multi-qty rows. | **All table-pass outputs** on every invoke. |
| **C) Post-extraction validation** (`bindMonetaryColumns` → `reconcileLineItemAmounts` → `finalizeExtractedLineItems`) | Deterministic rules after GPT: detect qty-inflation signature (extracted qty>1, total preserved, `unit_price ≈ total/qty`, undiscounted, pack notation) and correct quantity. Existing `applyEffectivePaidPrice` already halves unit_price when `qty×unit≠total` but **does not touch quantity**. | Gorgonzola-class rows show same total-preservation + qty=2 pattern (stability audit: 6/10 runs qty=2, total=13.44). Rule E neighbour bleed already rebinds prices, not qty. Risk of correcting legitimate fractional/multi-qty lines. | **All invoices** through monetary binding pipeline. |
| **D) Quantity sanity-check** (no current stage) | New dedicated gate: compare extracted qty against pack-metadata signals (`*N`, decimal KG in desc) and arithmetic closure (`qty×unit≈total`). Could run pre- or post-binding. | Without column OCR, must rely on description parsing — same ambiguity that triggers failure. Single-condition rules fail (Rolo shares weight token + undiscounted + blank CX). | Depends on placement; if global, **all line items**. If scoped to Bocconcino supplier template, **1 supplier**. |
| **E) Invoice review workflow** (`src/routes/invoices.tsx`) | Surface qty mismatch for human correction before procurement/price-history write. No automatic qty flagging exists today; user edits persisted `invoice_items.quantity`. | Does not fix extraction; stale qty persists until manual review. DB already holds qty=2 for Mezzi/Ricotta (phase1 forensics). | **Per-invoice operational** — no extraction blast radius, but pricing/margin wrong until corrected. |
| **F) Other** | **Procurement layer** (`resolveCountablePurchaseQuantityForCost`): already returns `purchase_quantity=1` for Mezzi/Ricotta despite `quantity=2` in DB (phase1 forensics) — masks cost display but not stored qty. **Net-subtotal reconcile** (`reconcileLineItemsToNetSubtotal`): price-only gap fix, no qty. **Catalog/GT overrides**: manual GT correction — not scalable. | Procurement masking hides symptom; price history still records wrong `new_price` from halved unit (effective-paid-contract-validation). | Procurement: rows where `total≈qty×unit_price` at wrong qty. GT overrides: audit integrity only. |

**Pipeline fact (evidence):** `extractTableItemsFromImage` → `bindMonetaryColumns` → `reconcileLineItemAmounts` → `finalizeExtractedLineItems`. Quantity is set at GPT Pass C and **never modified downstream** (vl-final-state-audit: Mezzi/Ricotta drift is `quantity` + `unit_price`, not reconcile-induced).

---

### Family A Regression Dataset

Sources: `family-a-scope-audit/audit-result.json`, `passc-refinement-validation/reextract/`, `final-validation-lab-rerun/extracts/` (deploy v25), `field-accuracy-audit/ground-truth.json`, `column-shift-audit/ground-truth.json` (Pomodori visible QUANT).

| Product | Invoice | OCR Qty | Current Hybrid H Qty | Expected Qty |
|---------|---------|---------|------------------------|--------------|
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | Bocconcino | 1 | 2 | 1 |
| **RICOTTA TREVIGIANA 1,5KG** | Bocconcino | 1 | 2 | 1 |
| POMODORI PELATI (CX 2,5KG*6) | Bocconcino | 1 (visible `QUANT.=1,000`) | 1 | 1 |
| ROLO DE CABRA E VACA 1KG | Bocconcino | 1 | 1 | 1 |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Bocconcino | 2 | 2 | 2 |
| MOZZARELLA FIOR DI LATTE 125GR*8 | Bocconcino | 10 | 10 | 10 |
| Arroz Agulha Metro Chef 12x1 kg | Aviludo May | 1 | 1 | 1 |
| Açúcar Branco METRO Chef 10x1 Kg | Aviludo May | 1 | 1 | 1 |
| Pepinos Extra Uli Frasco 6x720 g | Aviludo May | 1 | 1 | 1 |
| Mozzarella Fior di Latte 2Kg | Aviludo April | 1 | 1 (v28; v25 invoke empty) | 1 |
| Aceto balsamico pet 5l*2 Toschi | Mammafiore | 1 | 1 | 1 |
| Rulo Di Capra 1kg*2 Simonetta | Mammafiore | 1 | 1 | 1 |
| Farina Speciale pizza 25kg Amoruso | Mammafiore | 1 | 1 | 1 |

**Stability notes (Bocconcino, 10-run audit):** Mezzi 10/10 qty=2; Ricotta 10/10 qty=2; Pomodori 10/10 qty=1; Rolo 9/10 qty=1 (1 run qty=2 transient); Acqua 9/10 qty=2 (1 run qty=1 transient).

---

### Candidate Separating Signals

Observable conditions that **failures share** vs controls. No single signal separates all failures from all controls — root cause is **combination (E)** per prior investigation.

| Signal | Mezzi | Ricotta | Fails only? | Counterexample (correct row) |
|--------|-------|---------|-------------|------------------------------|
| OCR qty = 1 | ✓ | ✓ | No | Pomodori, Rolo, Arroz, Aceto, Rulo |
| Hybrid H qty > OCR qty | ✓ (2>1) | ✓ (2>1) | **Yes** (within 15-candidate set) | — |
| Supplier = IL BOCCONCINO | ✓ | ✓ | **Yes** (within VL corpus) | Other Bocconcino rows correct |
| Blank CX column | ✓ | ✓ | No | Pomodori, Rolo |
| Undiscounted (no DESC / `discount_pct` absent) | ✓ | ✓ | No | Rolo (same invoice, undiscounted, correct) |
| `unit_price ≈ total` at OCR qty=1 | ✓ (7.97=7.97; 27.56≈27.30) | ✓ | No | Rolo (12.71=12.71, qty stays 1) |
| Pack ambiguity in description | ✓ `(CX 1KG*6)` | ✓ `1,5KG` | No | Pomodori `(CX 2,5KG*6)`, Rulo Di Capra `1kg*2` |
| `*N` pack multiplier in desc | ✓ `*6` | — | No | Rulo Di Capra `*2`, Aceto `*2` |
| Decimal weight token in desc | — | ✓ `1,5KG` | No | Mozzarella `2Kg`, Farina `25kg` |
| Stable qty=2 across v25–v30 + 10/10 | ✓ | ✓ | **Yes** | Rolo 1/10 transient qty=2 only |
| Pass C pre-Hybrid baseline qty=1 | ✓ | ✓ | No | All Bocconcino passc rows |
| Implied ~50% discount after binding (`effective_paid ≈ unit/2`) | ✓ (13.65) | ✓ (3.985) | Partial | Other flagged rows in effective-paid audit (12/15) |
| Neighbour to discounted Pomodori row | ✓ (Mezzi adjacent) | — | No | — |

**Minimum observable combination separating failures from nearest controls:**

`OCR qty=1` **AND** `Hybrid H qty=2 (stable)` **AND** `undiscounted (blank DESC)` **AND** `unit_price≈total at qty=1` **AND** `IL BOCCONCINO template`

- Excludes Pomodori: has DESC 20% populated (not blank DESC).
- Excludes Rolo: Hybrid H qty=1 (stable), despite sharing undiscounted + weight token + blank CX + same invoice.
- Excludes Rulo Di Capra / Aceto: different supplier; qty=1 stable despite `*2` pack notation.

**Not sufficient alone:** pack notation, blank CX, weight token, or undiscounted — each matches ≥1 correct control.

---

### Blast Radius Analysis

Risk to named controls if correction strategy fires on its trigger signals:

| Control | Option A (Prompt) | Option B (Hybrid H qty adjust) | Option C (Post-extraction) | Option D (Review-only) |
|---------|-------------------|-------------------------------|---------------------------|------------------------|
| **Pomodori** | LOW — existing negative example; has DESC column | LOW — has discount_pct; combo trigger excludes | LOW — blank-DESC + undiscounted combo excludes | NONE |
| **Acqua** | LOW — qty=2 is column-faithful | LOW — OCR qty=2, not inflation pattern | LOW — not qty=1→2 inflation | NONE |
| **Mozzarella** (Bocconcino discounted) | LOW — has discount column | LOW — qty=10, discounted | MEDIUM — discounted lines excluded by design but qty×unit≠total | NONE |
| **Bidfood** | LOW — no Family A failures in corpus | LOW — no matching rows | LOW — different layout | NONE |
| **Aviludo** | LOW — 6/6 candidate rows correct today | LOW — pack rows stable at qty=1 | LOW — `N×SIZE` at qty=1 tested | NONE |
| **Mammafiore** | MEDIUM — prior Aceto/Rulo `1→2` counterfactuals from broad pack rules | MEDIUM — Gorgonzola/Farina share total-preservation patterns | MEDIUM — Guanciale/Birra discounted totals; Rulo borderline (`*2`) | NONE |

---

### Design Options

#### Option A — Localized Family A (prompt / template-scoped)

| | |
|---|---|
| **Scope** | Bocconcino column layout: QUANT + blank CX + blank DESC + undiscounted VALOR≈P.VENDA rows with pack notation |
| **Pros** | Addresses first divergence stage (Pass C); good-path reference exists (`persistence-audit/pass-c-raw` qty=1 for Mezzi/Ricotta); no new pipeline stage |
| **Cons** | Non-deterministic; prompt already has POMODORI guardrail yet Mezzi fails; no raw GPT capture for v25 bad path to diff |
| **Blast radius** | LOW if narrowly scoped to Bocconcino undiscounted pattern; MEDIUM if pack rules broaden |
| **Validation** | Re-extract Bocconcino 10× stability; full 15-candidate regression; Pomodori + Rolo must remain qty=1 |

#### Option B — Hybrid H qty adjustment (Pass C output or immediate post-GPT)

| | |
|---|---|
| **Scope** | Correct qty at or immediately after GPT table pass, before monetary binding |
| **Pros** | Fixes qty before `applyEffectivePaidPrice` halves unit; aligns stored qty with OCR |
| **Cons** | Same stage as failure origin — requires either better GPT or risky override; no intermediate validation layer exists today |
| **Blast radius** | MEDIUM — all Pass C outputs |
| **Validation** | Compare pre/post Hybrid H against passc-refinement baseline; 10-run stability on f0aa5a08 |

#### Option C — Post-extraction validation (monetary binding layer)

| | |
|---|---|
| **Scope** | New rule in `bindMonetaryColumns` or adjacent: detect qty-inflation signature and set `quantity = total / unit_price` or revert to 1 when closure matches |
| **Pros** | Deterministic; replayable on existing extracts without GPT calls; binding layer already has Rule B/E/effective-paid patterns; effective-paid-contract-validation shows distinctive `diff_pct≈50%` on failures |
| **Cons** | Gorgonzola qty=2/total=13.44 is structurally similar; must not conflate with legitimate cases; treats symptom not GPT cause |
| **Blast radius** | MEDIUM — all invoices through binding |
| **Validation** | Replay 15-candidate set + Gorgonzola 10-run + Emporio Pellegrino qty-decimal rows; assert 13/13 controls unchanged |

#### Option D — Invoice-review-only

| | |
|---|---|
| **Scope** | Flag Mezzi/Ricotta-class rows in UI for manual qty correction |
| **Pros** | Zero extraction regression risk; immediate operational mitigation |
| **Cons** | Does not fix automation; DB already wrong; procurement masks but price history polluted |
| **Blast radius** | NONE on extraction |
| **Validation** | UX review flow only; no regression test automation |

---

### Recommended Investigation Order

1. **Option C (Post-extraction validation)** — **Evaluate first**
   - **Why (evidence):** All 15 candidate rows have frozen v25 extracts and passc baselines; replay can test rules without GPT variance. Failures have a distinctive post-binding signature (`qty=2`, `total` unchanged, `effective_paid = total/qty`, `implied_discount≈50%`) documented in `effective-paid-contract-validation-result.json`. Downstream confirmed not to modify qty — any fix at C is provably additive. Separating combination (blank DESC + undiscounted + stable 2) can be tested against Rolo/Pomodori immediately.

2. **Option A (Localized prompt)** — **Second**
   - **Why:** First divergence is Pass C (passc baseline qty=1 vs Hybrid H qty=2; `artifact-index.json` notes no archived raw GPT for bad path). Prompt fix addresses root cause but requires re-extract + stability runs to validate. POMODORI guardrail proves prompt-only fixes can work for adjacent Bocconcino row — Mezzi failure shows guardrail is insufficient alone.

3. **Option B (Hybrid H qty adjustment)** — **Third (coupled with A or C)**
   - **Why:** Overlaps A (if GPT-side) and C (if binding-side). Investigate only after C replay proves whether deterministic post-GPT correction is safe; if C cannot separate from Gorgonzola, B-at-GPT-source needs raw capture (`.tmp/family-a-v25-raw-capture/` shows v36 still qty=2).

4. **Option D (Review-only)** — **Last**
   - **Why:** No extraction learning; acceptable only as interim ops bridge. phase1 forensics shows persisted qty=2 already affecting presentation.

**Prerequisite investigation (before any option):** Capture Pass C raw structured JSON for Mezzi/Ricotta on current deploy (gap noted in `family-a-v25-raw-capture/artifact-index.json`) to confirm whether GPT emits qty=2 or binding inflates it. passc-raw cache shows qty=1 at GPT layer for good path.

---

### Confidence

**HIGH (90%)** that Family A is localized to Mezzi + Ricotta on Bocconcino (`family-a-scope-audit`: 13/15 candidates correct, 10/10 stability on failures).

**HIGH (88%)** that failure originates at Pass C / Hybrid H extraction, not downstream (passc baseline qty=1; vl-final-state-audit quantity drift extract-vs-DB; binding code paths preserve `quantity`).

**MEDIUM (75%)** on minimum separating combination — Rolo is the hardest negative (same invoice, undiscounted, weight token, blank CX) and stably correct; 1/10 transient qty=2 warrants monitoring.

**MEDIUM (70%)** on safest correction point — post-extraction replay not yet executed; Gorgonzola parallel pattern is documented risk.

**LOW (40%)** on prompt-only fix sufficiency — Mezzi shares pack class with correct Rulo Di Capra; POMODORI guardrail does not cover undiscounted blank-DESC rows.
