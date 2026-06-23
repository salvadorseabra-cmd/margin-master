# Family A — Option C Offline Replay Validation

Generated: 2026-06-20T19:43:16.257Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: READ-ONLY

### Simulation Dataset

| Product | Category | Artifact | OCR Qty | Hybrid H Qty |
|---------|----------|----------|---------|--------------|
| Mezzi Paccheri | failure | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 1 | 2 |
| Ricotta | failure | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 1 | 2 |
| Pomodori | control | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 1 | 1 |
| Rolo (stable v25) | control | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 1 | 1 |
| Rolo (transient run 7) | negative | final-stability-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968-run7.json | 1 | 2 |
| Acqua | control | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 2 | 2 |
| Mozzarella (Bocconcino) | control | final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json | 10 | 10 |
| Arroz | control | final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json | 1 | 1 |
| Açúcar | control | final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json | 1 | 1 |
| Pepinos | control | final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json | 1 | 1 |
| Aceto | control | final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json | 1 | 1 |
| Rulo Di Capra | control | final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json | 1 | 1 |
| Farina | control | final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json | 1 | 1 |
| Gorgonzola (v25 Emporio) | negative | final-validation-lab-rerun/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json | 1.35 | 2 |
| Gorgonzola (effective-paid DB row) | negative | effective-paid-contract-validation-result.json | 1.35 | 2 |

### Reconstructed Option C Signals

From `family-a-fix-design/DESIGN.md` — no new logic invented.

| Signal | Source | Threshold / value |
|--------|--------|-------------------|
| OCR qty=1 | passc-refinement reextract | qty === 1 (Gorgonzola: 1.35) |
| Hybrid H qty=2 | final-validation-lab-rerun v25 | extracted qty === 2 |
| Hybrid H qty=2 stable | final-stability-audit 10-run | 10/10 qty=2 (failures only) |
| Undiscounted blank DESC | scope audit / visible invoice | no DESC column populated |
| unit_price ≈ total at qty=1 | extract raw fields | \|unit−total\|/total ≤ 2% |
| IL BOCCONCINO supplier | extract supplier field | template scope |
| Total preserved | binding replay | qty×raw_unit ≠ total; bound closes |
| Qty inflation signature | effective-paid-contract | binding_changed ∧ diff_pct ≥ 0.45 |

**Trigger:** all documented combo signals AND qty inflation signature.


### Replay Results

| Product | Would Trigger C? | Expected? | Outcome |
|---------|------------------|-----------|---------|
| Mezzi Paccheri | YES | YES | PASS |
| Ricotta | YES | YES | PASS |
| Pomodori | NO | NO | PASS |
| Rolo (stable v25) | NO | NO | PASS |
| Rolo (transient run 7) | NO | NO | PASS |
| Acqua | NO | NO | PASS |
| Mozzarella (Bocconcino) | NO | NO | PASS |
| Arroz | NO | NO | PASS |
| Açúcar | NO | NO | PASS |
| Pepinos | NO | NO | PASS |
| Aceto | NO | NO | PASS |
| Rulo Di Capra | NO | NO | PASS |
| Farina | NO | NO | PASS |
| Gorgonzola (v25 Emporio) | NO | NO | PASS |
| Gorgonzola (effective-paid DB row) | NO | NO | PASS |

#### Per-row signal values

**Mezzi Paccheri** (v25 baseline)
- OCR qty=1, Hybrid H qty=2, unit=27.36, total=27.3
- Binding: raw→bound diff_pct=0.5011, binding_changed=true
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=true, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=true, total_preserved=true, qty_inflation_signature=true, diff_pct_ge_45=true

**Ricotta** (v25 baseline)
- OCR qty=1, Hybrid H qty=2, unit=7.967, total=7.97
- Binding: raw→bound diff_pct=0.4992, binding_changed=true
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=true, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=true, total_preserved=true, qty_inflation_signature=true, diff_pct_ge_45=true

**Pomodori** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=22.05, total=22.05
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=false, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=true, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Rolo (stable v25)** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=12.71, total=12.71
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=true, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Rolo (transient run 7)** (stability run 7)
- OCR qty=1, Hybrid H qty=2, unit=12.187, total=12.17
- Binding: raw→bound diff_pct=0.5003, binding_changed=true
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=true, total_preserved=true, qty_inflation_signature=true, diff_pct_ge_45=true

**Acqua** (v25 baseline)
- OCR qty=2, Hybrid H qty=2, unit=23.19, total=41.27
- Binding: raw→bound diff_pct=0.11, binding_changed=true
- Signals: ocr_qty_eq_1=false, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=true, total_preserved=true, qty_inflation_signature=false, diff_pct_ge_45=false

**Mozzarella (Bocconcino)** (v25 baseline)
- OCR qty=10, Hybrid H qty=10, unit=8.12, total=81.23
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=false, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=false, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=true, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Arroz** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=13.95, total=13.95
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Açúcar** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=9.99, total=9.99
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Pepinos** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=22.49, total=22.49
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Aceto** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=15.55, total=16.09
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Rulo Di Capra** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=10.86, total=10.86
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=true, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Farina** (v25 baseline)
- OCR qty=1, Hybrid H qty=1, unit=26.52, total=25.52
- Binding: raw→bound diff_pct=0.0377, binding_changed=true
- Signals: ocr_qty_eq_1=true, hybrid_h_qty_eq_2=false, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=true, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=false, total_preserved=true, qty_inflation_signature=false, diff_pct_ge_45=false

**Gorgonzola (v25 Emporio)** (v25 baseline)
- OCR qty=1.35, Hybrid H qty=2, unit=6.6, total=13.44
- Binding: raw→bound diff_pct=0, binding_changed=false
- Signals: ocr_qty_eq_1=false, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=false, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=false, total_preserved=false, qty_inflation_signature=false, diff_pct_ge_45=false

**Gorgonzola (effective-paid DB row)** (effective-paid-contract-validation)
- OCR qty=1.35, Hybrid H qty=2, unit=10.22, total=13.44
- Binding: raw→bound diff_pct=0.3425, binding_changed=true
- Signals: ocr_qty_eq_1=false, hybrid_h_qty_eq_2=true, hybrid_h_qty_2_stable=false, undiscounted_blank_desc=false, unit_price_approx_total_at_qty1=false, supplier_il_bocconcino=false, total_preserved=true, qty_inflation_signature=false, diff_pct_ge_45=false


#### Sensitivity: rule without stability gate

| Product | Strict (with stability) | Looser (no stability) |
|---------|---------------------------|------------------------|
| Mezzi Paccheri | TRIGGER | TRIGGER |
| Ricotta | TRIGGER | TRIGGER |
| Pomodori | no | no |
| Rolo (stable v25) | no | no |
| Rolo (transient run 7) | no | TRIGGER |
| Acqua | no | no |
| Mozzarella (Bocconcino) | no | no |
| Arroz | no | no |
| Açúcar | no | no |
| Pepinos | no | no |
| Aceto | no | no |
| Rulo Di Capra | no | no |
| Farina | no | no |
| Gorgonzola (v25 Emporio) | no | no |
| Gorgonzola (effective-paid DB row) | no | no |

Rolo run 7 **would false-positive** if stability gate omitted.


### Gorgonzola Analysis

Gorgonzola shares qty=2 + total-preserved + binding_changed with Family A on the effective-paid row, but **does not trigger** the documented Option C rule because:
1. **Supplier gate** — Emporio Italia, not IL BOCCONCINO
2. **OCR qty** — visible/GT qty=1.35, not 1
3. **Undiscounted blank DESC** — visible Desc.(%) 22.85%; discounted row
4. **diff_pct** — 34.25% on effective-paid row (< 45% threshold); unit_price 10.22 ≠ total 13.44 at qty=1

- **Gorgonzola (v25 Emporio)**: trigger=false; diff_pct=0; supplier gate=false; ocr_qty=1=false; undiscounted blank DESC=false
- **Gorgonzola (effective-paid DB row)**: trigger=false; diff_pct=0.3425; supplier gate=false; ocr_qty=1=false; undiscounted blank DESC=false

### Rolo Analysis

**Stable Rolo (v25):** qty=1, no binding change, hybrid_h_qty_eq_2=false → no trigger.
**Transient run 7:** qty=2, unit≈total at qty=1 (12.187≈12.17), diff_pct=50.03%, qty_inflation_signature=true — **matches inflation profile** but **hybrid_h_qty_2_stable=false** (1/10 runs) blocks trigger.
Without stability gate, run 7 would **false-positive** (looser variant confirms).

- **Rolo (stable v25)** (v25 baseline): hybrid qty=1, trigger=false, outcome=PASS
- **Rolo (transient run 7)** (stability run 7): hybrid qty=2, trigger=false, outcome=PASS

### Metrics

- Family A recall: **100%** (2/2)
- Control precision: **100%** (10/10 unchanged)
- False positives: **0**
- False negatives: **0**

### Option C Readiness

**A) Replay proves Option C viable**


### Confidence

- **HIGH (88%)** that documented Option C rule separates Family A from all 10 controls + Gorgonzola on frozen artifacts
- **MEDIUM (72%)** that stability gate is required in production — Rolo run 7 is a documented boundary; omitting stability → FP
- **MEDIUM (70%)** that OCR-qty proxy (passc baseline) remains valid at runtime without live column OCR
- **LOW (55%)** on global rule without supplier scope — effective-paid audit shows 12/15 flagged rows `would_fix`; supplier+Bocconcino scoping essential

Evidence: `.tmp/family-a-option-c-replay/replay-result.json`, frozen extracts only, no GPT invokes.