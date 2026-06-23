# Family A Scope Audit — READ-ONLY

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Method: Pass C pre-Hybrid baseline (`.tmp/passc-refinement-validation/reextract/`) as OCR qty proxy + manual visible overrides; Hybrid H comparison from `.tmp/final-validation-lab-rerun/extracts/` (v25) with v26/v28/v30/residual/stability cross-check.

---

### Candidate Population

**51 rows audited** across 6 VL invoices (all items in passc-refinement-validation reextract).  
**15 candidates** match: OCR qty = 1 (or visible QUANT 1,000) **and** description contains weight/pack notation (KG/GR/CL/L/*N/CX/pack/EMB/N×SIZE).

| Invoice | Product | OCR Qty | Extracted Qty (v25+) | Description pattern | CXs | Unit | Supplier | Flag |
|---------|---------|---------|------------------------|---------------------|-----|------|----------|------|
| Bidfood | Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | 1 | 1 | Cx pack | — | cx | Bidfood Portugal | ok |
| Aviludo May | Pepinos Extra Uli Frasco 6x720 g | 1 | 1 | 6x720 g | — | cx | AVILUDO | ok |
| Aviludo May | Arroz Agulha Metro Chef 12x1 kg | 1 | 1 | 12x1 kg | — | cx | AVILUDO | ok |
| Aviludo May | Açucar Branco METRO Chef 10x1 Kg | 1 | 1 | 10x1 Kg | — | cx | AVILUDO | ok |
| Aviludo April | Pepinos Extra II Frasco 6x720g | 1 | 1 (v28) | 6x720g | — | cx | AVILUDO | ok |
| Aviludo April | Arroz Agulha Metro Chef 12x1kg | 1 | 1 (v28) | 12x1kg | — | cx | AVILUDO | ok |
| Aviludo April | Açúcar Branco Metro Chef 10x1Kg | 1 | 1 (v28) | 10x1Kg | — | cx | AVILUDO | ok |
| Aviludo April | Mozzarella Fior di Latte 2Kg | 1 | 1 (v28) | 2Kg | — | un | AVILUDO | ok |
| **Bocconcino** | **MEZZI PACCHERI MANCINI (CX 1KG*6)** | **1** | **2** | **(CX 1KG*6)** | blank | uni | IL BOCCONCINO | **OCR=1, Extracted>1** |
| Bocconcino | POMODORO PELATI (CX 2.5KG*6) | 1 (visible) | 1 | (CX 2,5KG*6) | blank | uni | IL BOCCONCINO | ok |
| **Bocconcino** | **RICOTTA TREVIGIANA 1,5KG** | **1** | **2** | **1,5KG** | blank | uni | IL BOCCONCINO | **OCR=1, Extracted>1** |
| Bocconcino | ROLO DE CABRA E VACA 1KG | 1 | 1 | 1KG | — | uni | IL BOCCONCINO | ok |
| Mammafiore | Farina Speciale pizza 25kg Amoruso | 1 | 1 | 25kg | — | un | Mammafiore Portugal | ok |
| Mammafiore | Aceto balsamico di modena IGP pet 5l*2 Toschi | 1 | 1 | 5l*2 | — | un | Mammafiore Portugal | ok |
| Mammafiore | Rulo Di Capra 1kg*2 Simonetta | 1 | 1 | 1kg*2 | — | un | Mammafiore Portugal | ok |

Note: Aviludo April v25 invoke returned 0 items (footer fixture); v28 used for extracted qty. Pomodor OCR qty from visible transcription (`column-reconstruction.json` QUANT.=1,000); passc baseline incorrectly reads qty=2.

---

### Family A Failures

**Count: 2** — both on invoice `f0aa5a08` (IL Bocconcino), supplier IL BOCCONCINO DISTRIBUIÇÃO ALIMENTAR.

| Invoice | Product | OCR Qty | Extracted Qty | Unit | Unit € (v25) | Total € | Mechanism |
|---------|---------|---------|---------------|------|--------------|---------|-----------|
| Bocconcino | MEZZI PACCHERI MANCINI (CX 1KG*6) | 1 | 2 | uni | 27.36 → 13.65 effective | 27.30 (unchanged) | qty doubled; total preserved; unit halved |
| Bocconcino | RICOTTA TREVIGIANA 1,5KG | 1 | 2 | uni | 7.967 → 3.985 effective | 7.97 (unchanged) | qty doubled; total preserved; unit halved |

**Cross-version stability (Hybrid H qty):**

| Product | v25 | v26 | v27 | v28 | v30 | 10-run stability |
|---------|-----|-----|-----|-----|-----|------------------|
| MEZZI PACCHERI | 2 | 2 | 2 | 2 | 2 | 10/10 qty=2 |
| RICOTTA TREVIGIANA | 2 | 2 | 2 | 2 | 2 | 10/10 qty=2 |

Pass C baseline (pre-Hybrid) reads qty=1 for both; downstream does not modify qty (vl-final-state-audit: quantity drift is extract vs DB, not reconcile). Failure originates at Hybrid H Pass C extraction.

**Undiscounted + VALOR≈P.VENDA pattern:**

- RICOTTA: baseline unit 7.97 = total 7.97 (no discount column); v25 unit 7.967 � total 7.97 at qty=2.
- MEZZI: baseline unit 27.56, total 27.30 (~0.3% spread); v25 unit 27.36, total 27.30 — total locked, qty inflated.

---

### Similar Rows That Remain Correct

Structurally similar to Ricotta/Mezzi/Rolo/Pomodori but **OCR=1 and Extracted=1**:

| Invoice | Product | Why similar | OCR | Extracted | Notes |
|---------|---------|-------------|-----|-----------|-------|
| Bocconcino | ROLO DE CABRA E VACA 1KG | Same invoice, weight token 1KG, undiscounted | 1 | 1 | Stable 9/10 runs qty=1 (1/10 run qty=2 — isolated variance, not Family A pattern) |
| Bocconcino | POMODORI PELATI (CX 2,5KG*6) | CX+*N pack notation, blank CXs | 1 (visible) | 1 | Has 20% DESC — different column layout; v25 matches visible (bocconcino-gt-validation verdict B) |
| Mammafiore | Rulo Di Capra 1kg*2 Simonetta | Pack *2 multiplier in description | 1 | 1 | Same structural ambiguity class as Mezzi CX*6 but qty correct |
| Mammafiore | Aceto balsamico pet 5l*2 Toschi | Pack *2 in description | 1 | 1 | qty=1 correct |
| Aviludo May/April | Arroz 12x1kg, Açucar 10x1Kg, Pepinos 6x720g | CX/pack N×SIZE rows at qty=1 | 1 | 1 | No qty inflation on METRO Chef pack rows |
| Aviludo April | Mozzarella Fior di Latte 2Kg | Weight token 2Kg at qty=1 | 1 | 1 | Correct |
| Mammafiore | Farina Speciale pizza 25kg | Weight token 25kg at qty=1 | 1 | 1 | Correct |

---

### Cluster Analysis

| Cluster | Family A failures | Correct similar rows |
|---------|-------------------|----------------------|
| **CX+*N** (e.g. `(CX 1KG*6)`) | MEZZI PACCHERI | POMODORI (CX 2,5KG*6) — correct |
| **decimal_weight_1,5KG** | RICOTTA TREVIGIANA | — |
| **weight_token** (bare KG) | RICOTTA (shared) | ROLO DE CABRA 1KG — correct |
| **pack_multiplier** (*N in desc) | MEZZI (via *6) | Rulo Di Capra 1kg*2 — correct |
| **blank CX** | MEZZI, RICOTTA | POMODORI — correct |

**Ricotta vs Mezzi — same cluster or different?**

- **Different primary clusters**: Mezzi = CX+*N + pack_multiplier; Ricotta = decimal_weight_1,5KG + weight_token.
- **Shared**: blank CX column on Bocconcino layout; identical failure mechanism (qty 1→2, total preserved, unit_price ≈ total/qty); same invoice/supplier/template.
- **Conclusion**: Different surface patterns, **same underlying failure mode** on the same invoice.

---

### Scope Assessment

| Metric | Value |
|--------|-------|
| Rows audited | 51 |
| Candidate population (OCR qty=1 + weight notation) | 15 |
| Family A failures | 2 |
| Invoices affected | 1 / 6 (16.7%) — **Bocconcino only** |
| Suppliers affected | 1 — IL BOCCONCINO |
| Financial impact (qty field) | €0 line-total delta (total preserved); effective unit halved |
| Other VL invoices with OCR=1 pack/weight candidates | 0 failures |

---

### Is Family A Localized Or Systemic?

**Localized (Answer A): only Ricotta + Mezzi on Bocconcino.**

Evidence:
- 13/15 candidates extract qty=1 correctly across Bidfood, Aviludo (May+April), Mammafiore, and 3 other Bocconcino rows.
- Only MEZZI and RICOTTA show stable OCR=1 → Hybrid H qty=2 across v25–v30 and 10/10 stability runs.
- No other invoice or supplier exhibits this failure mode in the audited population.
- Not a broader Hybrid H qty problem (Answer C ruled out): 49/51 non-candidate rows and all non-Bocconcino candidates unaffected.

---

### Confidence

**HIGH (92%)**

Supporting evidence:
- Confirmed OCR qty=1 for both failures via passc-refinement baseline + bocconcino-investigation DB (Mezzi qty=1, Ricotta qty=1 at first ingest).
- Hybrid H qty=2 reproducible v25–v30 and 10/10 stability (Mezzi, Ricotta).
- Downstream invariant: total unchanged, unit_price rescales (gross-net-global-audit implied_discount_pct ≈50%).
- Pomodor excluded: visible OCR=1, Hybrid H correctly extracts 1 (prior GT qty=2 was catalog error, not Family A).

Uncertainty (8%):
- OCR proxy uses passc-refinement reextract rather than raw OCR engine output for all rows; Bocconcino visible qty confirmed only for Pomodor column-reconstruction.
- Rolo showed 1/10 stability run with qty=2 (transient, not stable Family A).

---

Artifacts: `.tmp/family-a-scope-audit/audit-result.json`
