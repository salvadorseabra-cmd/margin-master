# Family A — Option C Full Effective-Paid Population Replay

Generated: 2026-06-21T01:30:24.982Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: READ-ONLY

## Full Population

**Verified count: 15/15**

| # | Product | Class | Supplier | Invoice | Would Fix |
|---|---------|-------|----------|---------|-----------|
| 1 | MEZZI PACCHERI MANCINI (CX 1KG*6) | A) Confirmed Family A | Il Bocconcino Distribuição Alimentar | f0aa5a08… | true |
| 2 | RICOTTA TREVIGIANA 1,5KG | A) Confirmed Family A | Il Bocconcino Distribuição Alimentar | f0aa5a08… | true |
| 3 | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg | C) Gorgonzola-like | Emporio Italia | ab52796d… | true |
| 4 | Alho Francês | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | false |
| 5 | Manjericão | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | false |
| 6 | Pêra Abacate Hasse | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | true |
| 7 | Courgettes | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | true |
| 8 | Pepino | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | true |
| 9 | Hortelã | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | true |
| 10 | Tomilho | E) Other (Bidfood ~20% line discount pattern) | Bidfood Portugal | da472b7f… | true |
| 11 | Abóbora Butternut | E) Other | Bidfood Portugal | da472b7f… | true |
| 12 | Baladin - Ginger Beer 0.20cl | D) Legitimate quantity >1 | Emporio Italia | ab52796d… | true |
| 13 | De Cecco - Paccheri Lisci Nr. 125 - 500g | D) Legitimate quantity >1 | Emporio Italia | ab52796d… | true |
| 14 | Salada Ibérica FSTK EMB. 250g | D) Legitimate quantity >1 | Bidfood Portugal | da472b7f… | true |
| 15 | Aceto balsamico di modena IGP pet 5l*2 Toschi | E) Other | Mammafiore Portugal | 36c99d19… | false |

### Classification breakdown

- **A) Confirmed Family A**: 2
- **C) Gorgonzola-like**: 1
- **E) Other (Bidfood ~20% line discount pattern)**: 7
- **E) Other**: 2
- **D) Legitimate quantity >1**: 3

## Replay Results

| Product | Supplier | Would Trigger? | Expected? | Outcome |
|---------|----------|----------------|-----------|---------|
| MEZZI PACCHERI MANCINI (CX 1KG*6) | Il Bocconcino Distribuição Alimentar | YES | YES | PASS |
| RICOTTA TREVIGIANA 1,5KG | Il Bocconcino Distribuição Alimentar | YES | YES | PASS |
| Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg | Emporio Italia | NO | NO | PASS |
| Alho Francês | Bidfood Portugal | NO | NO | PASS |
| Manjericão | Bidfood Portugal | NO | NO | PASS |
| Pêra Abacate Hasse | Bidfood Portugal | NO | NO | PASS |
| Courgettes | Bidfood Portugal | NO | NO | PASS |
| Pepino | Bidfood Portugal | NO | NO | PASS |
| Hortelã | Bidfood Portugal | NO | NO | PASS |
| Tomilho | Bidfood Portugal | NO | NO | PASS |
| Abóbora Butternut | Bidfood Portugal | NO | NO | PASS |
| Baladin - Ginger Beer 0.20cl | Emporio Italia | NO | NO | PASS |
| De Cecco - Paccheri Lisci Nr. 125 - 500g | Emporio Italia | NO | NO | PASS |
| Salada Ibérica FSTK EMB. 250g | Bidfood Portugal | NO | NO | PASS |
| Aceto balsamico di modena IGP pet 5l*2 Toschi | Mammafiore Portugal | NO | NO | PASS |

## New Trigger Analysis

Non-Family-A rows only. Option C trigger = documentedCombo AND qty_inflation_signature.

### Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg (C) Gorgonzola-like)

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_2_stable, undiscounted_blank_desc, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.3425)
- Assumptions: stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Alho Francês (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1977)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Manjericão (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1984)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Pêra Abacate Hasse (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1992)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Courgettes (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.2)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Pepino (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1977)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Hortelã (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1988)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Tomilho (E) Other (Bidfood ~20% line discount pattern))

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1984)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Abóbora Butternut (E) Other)

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1694)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Baladin - Ginger Beer 0.20cl (D) Legitimate quantity >1)

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_2_stable, undiscounted_blank_desc, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1069)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### De Cecco - Paccheri Lisci Nr. 125 - 500g (D) Legitimate quantity >1)

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, undiscounted_blank_desc, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.1064)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Salada Ibérica FSTK EMB. 250g (D) Legitimate quantity >1)

- **NO trigger** — blocking: ocr_qty_eq_1, hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0.0601)
- Assumptions: ocr_qty: null in risk-population — treated as NOT eq 1 (ocr_qty_eq_1=false); stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)

### Aceto balsamico di modena IGP pet 5l*2 Toschi (E) Other)

- **NO trigger** — blocking: hybrid_h_qty_eq_2, hybrid_h_qty_2_stable, undiscounted_blank_desc, unit_price_approx_total_at_qty1, supplier_il_bocconcino
- qty_inflation_signature also false (diff_pct=0)
- Assumptions: stable_qty_2=false from risk-audit (no 10/10 qty=2 stability)


## Metrics

### Full effective-paid population (15 rows)

- Population size: **15**
- Triggered rows: **2** (Mezzi + Ricotta only)
- Family A recall: **100%** (2/2)
- Control precision: **100%** (13/13 non-Family-A unchanged)
- False positives: **0**
- False negatives: **0**
- Pass count: **15/15**

### Original replay set (simulation harness, 15 rows)

- Family A recall: **100%**
- Control precision: **100%**
- False positives: **0**
- False negatives: **0**
- Note: original set includes extract-artifact controls (Pomodori, Rolo, etc.) not in effective-paid population

## Delta vs Previous Replay

### MEZZI PACCHERI MANCINI (CX 1KG*6)

- Previous harness row: **Mezzi Paccheri**
- Identical: **YES**
  - No differences in wouldTriggerC, outcome, or signals

### RICOTTA TREVIGIANA 1,5KG

- Previous harness row: **Ricotta**
- Identical: **YES**
  - No differences in wouldTriggerC, outcome, or signals

### Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg

- Previous harness row: **Gorgonzola (effective-paid DB row)**
- Identical: **YES**
  - No differences in wouldTriggerC, outcome, or signals

### Aceto balsamico di modena IGP pet 5l*2 Toschi

- Previous harness row: **Aceto**
- Identical: **NO**
  - signal.undiscounted_blank_desc: true → false

### Newly evaluated effective-paid rows (11)

- **Alho Francês**: trigger=false, outcome=PASS
- **Manjericão**: trigger=false, outcome=PASS
- **Pêra Abacate Hasse**: trigger=false, outcome=PASS
- **Courgettes**: trigger=false, outcome=PASS
- **Pepino**: trigger=false, outcome=PASS
- **Hortelã**: trigger=false, outcome=PASS
- **Tomilho**: trigger=false, outcome=PASS
- **Abóbora Butternut**: trigger=false, outcome=PASS
- **Baladin - Ginger Beer 0.20cl**: trigger=false, outcome=PASS
- **De Cecco - Paccheri Lisci Nr. 125 - 500g**: trigger=false, outcome=PASS
- **Salada Ibérica FSTK EMB. 250g**: trigger=false, outcome=PASS

### Previous replay only (simulation controls, 11 rows)

These rows validated Option C on frozen extracts but are NOT in the 15 effective-paid flagged population.

- Pomodori (control)
- Rolo (stable v25) (control)
- Rolo (transient run 7) (negative)
- Acqua (control)
- Mozzarella (Bocconcino) (control)
- Arroz (control)
- Açúcar (control)
- Pepinos (control)
- Rulo Di Capra (control)
- Farina (control)
- Gorgonzola (v25 Emporio) (negative)

## Coverage Closure

- Previous coverage: **26.7%** (4/15 direct effective-paid replays)
- Full population coverage: **100%** (15/15)
- Remaining untested effective-paid rows: **0**

### Unresolved risk clusters

- **C) Gorgonzola-like** (1 rows, all blocked=true): Highest similarity to Family A; blocked by supplier/OCR/discount/diff_pct gates
  - Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg
- **D) Legitimate quantity >1** (3 rows, all blocked=true): would_fix via binding but not Family A; Option C does not trigger
  - Baladin - Ginger Beer 0.20cl
  - De Cecco - Paccheri Lisci Nr. 125 - 500g
  - Salada Ibérica FSTK EMB. 250g
- **E) Bidfood ~20% discount** (7 rows, all blocked=true): Line-discount pattern; diff_pct ~20%, not qty inflation
  - Alho Francês
  - Manjericão
  - Pêra Abacate Hasse
  - Courgettes
  - Pepino
  - Hortelã
  - Tomilho

## Evidence Verdict

**A) Option C survives full-population replay**

Evidence:
- 15/15 effective-paid rows evaluated with frozen binding data
- Option C triggers only on Mezzi Paccheri + Ricotta (confirmed Family A)
- 13 non-Family-A rows do NOT trigger despite 12/15 having would_fix=true under binding
- Gorgonzola (C cluster) blocked by supplier, OCR qty≠1, discount, diff_pct<45%
- Bidfood cluster blocked by diff_pct~20%, qty≠2, supplier≠Bocconcino, ocr_qty null

## Confidence

- Full-population replay: **90%**
- OCR-qty proxy for null rows: **55%** (11 rows lack passc OCR baseline)
- Stability gate for Family A: **85%**
- Supplier scope essential: **88%**
- 15/15 effective-paid rows replayed with frozen binding + risk-audit metadata
- Zero false positives on 13 non-Family-A effective-paid rows
- 100% Family A recall (Mezzi + Ricotta)
- 11 rows newly covered vs prior 4 direct effective-paid replays