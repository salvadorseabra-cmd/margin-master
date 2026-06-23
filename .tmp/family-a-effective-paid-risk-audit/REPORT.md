# Family A Option C — Effective-Paid Risk Surface Audit

Generated: 2026-06-21  
VL project: `bjhnlrgodcqoyzddbpbd`  
Mode: **STRICT READ-ONLY** — no code, DB, deployment, or prompt changes.

Sources merged:
- `.tmp/effective-paid-contract-validation-result.json`
- `.tmp/gross-net-global-audit-output.json` (JSON summary block)
- `.tmp/phase1-validation-forensics-result.json`
- `.tmp/family-a-scope-audit/audit-result.json`
- `.tmp/family-a-option-c-replay/replay-result.json`

Machine-readable output: `.tmp/family-a-effective-paid-risk-audit/risk-population.json`

---

### Effective-Paid Population

**Baseline:** All three audits converge on the same **15 flagged invoice lines** in VL `bjhnlrgodcqoyzddbpbd` (52 total invoice items; 28.85% flagged). No additional rows appear in `phase1-validation-forensics-result.json` beyond this set; phase1 adds Ricotta qty=1 vs qty=2 forensics and Bocconcino control lines (Mozzarella, Stracciatella, Pomodori, Rolo) not in the effective-paid flag list.

**Risk population filter** (ANY of):
- `binding_changed = true`
- `would_fix = true`
- `diff_pct > 20%`
- `quantity > 1` with total-preservation behaviour (`qty × unit_price ≠ total` but bound total unchanged)

| Metric | Count |
|--------|------:|
| Total flagged (effective-paid) | 15 |
| **Risk population (filter match)** | **14** |
| Excluded from risk population | 1 (Aceto — see below) |
| `would_fix: true` | 12 |
| `would_fix: false` | 3 |
| Confirmed Family A | 2 |
| Suppliers with flags | 4 (Bidfood 9, Emporio 3, Bocconcino 2, Mammafiore 1) |

**Excluded row:** Aceto balsamico (`1ccf0bd0…`) — flagged in gross-net audit (3.36% total mismatch) but **no** `binding_changed`, **no** `would_fix`, **no** `diff_pct > 20%`, qty=1 without qty-inflation total preservation. Operational mismatch is procurement-unit path, not Family A binding.

**Risk population rows (14)** — key fields:

| ID (short) | Product | Supplier | Extracted Qty | Unit € | Total € | diff_pct | binding_changed | would_fix | Risk triggers |
|------------|---------|----------|---------------|--------|---------|----------|-----------------|-----------|---------------|
| bb4bbfac | MEZZI PACCHERI MANCINI (CX 1KG*6) | Il Bocconcino | 2 | 27.31→13.65 | 27.30 | 50.02% | yes | yes | all four |
| 409850ab | RICOTTA TREVIGIANA 1,5KG | Il Bocconcino | 2 | 7.97→3.99 | 7.97 | 49.94% | yes | yes | all four |
| 33dc7070 | Gorgonzola DOP 1/8 1,5kg | Emporio Italia | 2 | 10.22→6.72 | 13.44 | 34.25% | yes | yes | all four |
| 4ad54bd5 | Alho Francês | Bidfood | 5.42 | 1.77→1.42 | 7.67 | 19.77% | yes | **no** | binding + qty>1 preserved |
| 41bf997f | Manjericão | Bidfood | 5 | 2.57→2.06 | 10.28 | 19.84% | yes | **no** | binding + qty>1 preserved |
| 434e2500 | Pêra Abacate Hasse | Bidfood | 3.28 | 5.32→4.26 | 13.96 | 19.92% | yes | yes | binding + qty>1 preserved |
| 0d50905c | Courgettes | Bidfood | 3.3 | 1.95→1.56 | 5.15 | 20.00% | yes | yes | binding + qty>1 preserved |
| 1ddcdc66 | Pepino | Bidfood | 3.36 | 1.77→1.42 | 4.76 | 19.77% | yes | yes | binding + qty>1 preserved |
| 43c623cb | Hortelã | Bidfood | 0.5 | 6.74→5.40 | 2.70 | 19.88% | yes | yes | binding |
| d998575f | Tomilho | Bidfood | 1 | 2.57→2.06 | 2.06 | 19.84% | yes | yes | binding |
| 2ab220fa | Abóbora Butternut | Bidfood | 5.42 | 1.24→1.03 | 5.59 | 16.94% | yes | yes | binding + qty>1 preserved |
| 4843605f | Baladin Ginger Beer 0.20cl | Emporio Italia | 2 | 10.85→9.69 | 19.38 | 10.69% | yes | yes | binding + qty=2 preserved |
| 867121e4 | De Cecco Paccheri 500g | Emporio Italia | 24 | 2.35→2.10 | 50.40 | 10.64% | yes | yes | binding + qty>1 preserved |
| 709cda62 | Salada Ibérica FSTK 250g | Bidfood | 4 | 2.33→2.19 | 8.76 | 6.01% | yes | yes | binding + qty>1 preserved |

**Phase1 forensics additions (not new flags, mechanistic):**
- Ricotta: OCR/extract qty=1 → bound qty=2 doubles usable stock (3 kg vs 1.5 kg); procurement `purchaseQty` stays 1 either way (`phase1-validation-forensics-result.json` `binding_qty1_vs_qty2`).
- Mezzi Paccheri: `structure_total` path — inner pack not rescaled by row qty (`gross-net-global-audit-output.json` stock_usable_source logs).

---

### Row Classification

OCR Qty from `family-a-scope-audit` (passc baseline + visible overrides) where available; Bidfood/Emporio effective-paid rows lack passc OCR proxy → **null**.

| Product | Supplier | Invoice | OCR Qty | Extracted Qty | diff_pct | binding_changed | Family A? | Class |
|---------|----------|---------|---------|---------------|----------|-----------------|-----------|-------|
| MEZZI PACCHERI MANCINI (CX 1KG*6) | Il Bocconcino | f0aa5a08 | 1 | 2 | 50.02% | yes | **Yes** | **A) Confirmed Family A** |
| RICOTTA TREVIGIANA 1,5KG | Il Bocconcino | f0aa5a08 | 1 | 2 | 49.94% | yes | **Yes** | **A) Confirmed Family A** |
| Gorgonzola DOP 1/8 1,5kg | Emporio Italia | ab52796d | 1.35 | 2 | 34.25% | yes | No | **C) Gorgonzola-like** |
| Alho Francês | Bidfood Portugal | da472b7f | — | 5.42 | 19.77% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Manjericão | Bidfood Portugal | da472b7f | — | 5 | 19.84% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Pêra Abacate Hasse | Bidfood Portugal | da472b7f | — | 3.28 | 19.92% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Courgettes | Bidfood Portugal | da472b7f | — | 3.3 | 20.00% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Pepino | Bidfood Portugal | da472b7f | — | 3.36 | 19.77% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Hortelã | Bidfood Portugal | da472b7f | — | 0.5 | 19.88% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Tomilho | Bidfood Portugal | da472b7f | — | 1 | 19.84% | yes | No | **E) Other (Bidfood ~20% discount)** |
| Abóbora Butternut | Bidfood Portugal | da472b7f | — | 5.42 | 16.94% | yes | No | **E) Other** |
| Baladin Ginger Beer 0.20cl | Emporio Italia | ab52796d | — | 2 | 10.69% | yes | No | **D) Legitimate quantity >1** |
| De Cecco Paccheri 500g | Emporio Italia | ab52796d | — | 24 | 10.64% | yes | No | **D) Legitimate quantity >1** |
| Salada Ibérica FSTK 250g | Bidfood Portugal | da472b7f | — | 4 | 6.01% | yes | No | **D) Legitimate quantity >1** |
| Aceto balsamico 5l*2 Toschi | Mammafiore Portugal | 36c99d19 | 1 | 1 | 0.00% | **no** | No | **E) Other** (outside risk population) |

**Classification counts:** A=2, B=0, C=1, D=3, E=9 (including Aceto).

**Evidence notes:**
- **A:** Scope audit Family A failures; 10/10 stable Hybrid H qty=2; OCR qty=1 (`family-a-scope-audit`).
- **C:** Same qty=2 + total-preserved + `binding_changed` + `would_fix:true` as Family A; differs on supplier (Emporio), OCR qty (1.35), visible discount 22.85%, diff_pct 34% not 50% (`family-a-option-c-replay` Gorgonzola negative).
- **E (Bidfood):** 9/11 Bidfood lines flagged; uniform ~20% implied discount on fresh produce/herbs; arithmetic inconsistent on Alho/Manjericão blocks `would_fix` despite binding change.
- **D:** Column-faithful multi-qty or weight-priced lines; no OCR=1→2 inflation signature.

---

### Family A Similarity Ranking

Weighted signal score (max 98 pts → 100%): OCR qty=1 (15), qty=2 (12), stable qty=2 (10), unit≈total@qty1 (10), total preserved (10), Bocconcino supplier (10), binding_changed (8), diff_pct≥45% (8), weight token (5), pack notation (5), blank DESC (5).

**Family A reference rows:** Mezzi 100%, Ricotta 94.9%.

**Non-Family-A ranking (closest neighbours first):**

| Rank | Product | Supplier | Similarity | Closest Family A neighbour | Shared signals vs Family A |
|------|---------|----------|------------|------------------------------|----------------------------|
| 1 | **Gorgonzola DOP** | Emporio | **35.7%** | **Ricotta** (decimal weight 1,5kg) | qty=2, total preserved, binding_changed, weight token |
| 2 | Baladin Ginger Beer | Emporio | 35.7% | Mezzi (qty=2 surface) | qty=2, total preserved, binding_changed, weight token |
| 3 | Aceto balsamico 5l*2 | Mammafiore | 35.7% | Mezzi (pack *2) | OCR qty=1, total preserved, weight token, pack notation — **no binding change** |
| 4 | Salada Ibérica 250g | Bidfood | 28.6% | — | binding_changed, total preserved, weight token |
| 5–12 | Bidfood produce/herbs (8 rows) | Bidfood | 23.5% | — | binding_changed, total preserved only |
| 13 | De Cecco Paccheri ×24 | Emporio | 23.5% | — | binding_changed, total preserved, weight token |

**Closest non-Family-A neighbour:** **Gorgonzola** at 35.7% — shares qty=2, total preservation, binding halving, and weight token with Ricotta; missing OCR=1, Bocconcino supplier, unit≈total@qty1, diff_pct≥45%, stability, blank DESC.

**Out-of-population boundary (replay harness, not in effective-paid 15):** Rolo de Cabra (Bocconcino) transient run 7 — would score ~82% similarity (matches all gates except stability); documented in `family-a-option-c-replay` as looser-rule false positive.

---

### False Positive Risk Surface

Assumes a future engineer implements Option C **incorrectly** (drops gates, mis-scopes, or confuses effective-paid binding fix with qty correction).

| Risk tier | Rows | Mechanism if implemented wrong |
|-----------|------|--------------------------------|
| **HIGH** | **Gorgonzola** (`33dc7070`) | `would_fix:true`; qty=2 + total preserved + binding_changed; only blocked by supplier/OCR/discount/diff_pct≥45% gates. Dropping any two gates risks qty=1 correction on legitimate 2×1.35 kg purchase. Operational delta 34.3% (`effective-paid-contract-validation` affected section). |
| **HIGH** | **Rolo de Cabra** (Bocconcino, *not in 15-row effective-paid set*) | 1/10 stability run qty=2 with ~50% binding signature; strict Option C blocks via stability; **looser variant triggers** (`sensitivity-result.json` `omit_hybrid_h_qty_2_stable`). Same-invoice undiscounted blank-DESC row. |
| **MEDIUM** | **7 Bidfood `would_fix:true` rows** | Courgettes, Pepino, Pêra, Hortelã, Tomilho, Abóbora, Salada — legitimate ~6–20% supplier discounts; not qty inflation. Incorrect “fix all would_fix” or “binding_changed → halve qty” would corrupt produce pricing. |
| **MEDIUM** | **Ginger Beer, De Cecco ×24** | Emporio lines with `would_fix:true`; qty=2 and qty=24 are column-faithful; binding reflects trade discount not OCR inflation. |
| **LOW** | **Alho, Manjericão** | `would_fix:false` (arithmetic gate); binding_changed only. |
| **LOW** | **Aceto** | No binding change; outside risk population. |

**Sensitivity ablation evidence** (`family-a-option-c-replay/sensitivity-result.json`):
- Only **stability gate** removal adds FP (Rolo run 7).
- Removing supplier, OCR, diff_pct≥45%, or undiscounted DESC gates: **0 FP** on frozen 15-row replay set — but that set includes only **4/15 effective-paid rows**.

**Blast radius if engineer applies qty=1 to all `would_fix:true` rows:** **12/15 lines** (80%) — includes 2 Family A targets + 1 Gorgonzola + 9 others.

---

### Replay Coverage Analysis

| Dataset | Rows | Overlap with effective-paid 15 |
|---------|-----:|--------------------------------|
| Effective-paid flagged population | 15 | — |
| Option C replay harness (`family-a-option-c-replay`) | 15 | **4 direct ID matches** |
| Family A failures in replay | 2 | Mezzi + Ricotta ✓ |
| Effective-paid rows in replay | 4 | Mezzi, Ricotta, Gorgonzola (DB row), Aceto |
| **Effective-paid rows NOT in replay** | **11** | All Bidfood (9) + Ginger Beer + De Cecco Paccheri |

**Tested vs not tested (effective-paid population):**

| Status | Count | Rows |
|--------|------:|------|
| Tested in Option C replay | 4 | bb4bbfac, 409850ab, 33dc7070, 1ccf0bd0 |
| **Not tested** | **11** | All Bidfood flagged lines; Baladin Ginger Beer; De Cecco Paccheri |
| Of 14 risk-population rows tested | 3/14 | 21.4% |
| Of 12 `would_fix:true` tested | 3/12 | 25.0% |

**Coverage percentage:** **26.7%** of effective-paid population (4/15) has direct Option C replay outcomes; **73.3% untested**.

Replay harness rows (15) are a **different cohort** — Bocconcino controls, Aviludo, Mammafiore negatives — designed for Family A separation, not effective-paid enumeration.

---

### Readiness Impact

| Question | Assessment | Evidence |
|----------|------------|----------|
| Does this audit change Option C viability on Family A targets? | **No change** | Replay already shows 2/2 recall, 0 FP on frozen harness (`family-a-option-c-replay`: metrics 100%/100%). |
| Does effective-paid population validate broader safety? | **Weakens global claim** | 11/15 effective-paid rows never replayed; 12/15 `would_fix:true` under binding — far wider than 2 Family A failures. |
| Stability gate necessity | **Confirmed load-bearing** | Only ablation with FP; Rolo precedent. |
| Supplier/metadata hardcoding | **Confirmed load-bearing** | Gorgonzola `would_fix:true` but blocked by non-Bocconcino + OCR 1.35 + discount; metadata not portable. |
| Prior readiness review status | **Partially superseded** | `family-a-readiness-review` listed replay as blocker — now executed for 15-row harness but not for effective-paid population. |

**Net readiness impact on Option C confidence for production deployment beyond Mezzi/Ricotta:** evidence suggests **stay same** for strict documented rule on Family A, **decrease** for confidence that Option C generalizes across the effective-paid surface without additional testing.

---

### Confidence

| Claim | Level | Rationale |
|-------|-------|-----------|
| Risk population completely enumerated | **HIGH (95%)** | Single 15-row universe across three audits; deterministic merge |
| Family A limited to 2 rows in effective-paid set | **HIGH (92%)** | Scope audit + binding signature |
| Gorgonzola is primary FP neighbour | **HIGH (88%)** | Highest similarity; shared would_fix + inflation mechanics |
| 73% effective-paid gap is material | **HIGH (90%)** | 11 rows with zero Option C replay outcomes |
| Bidfood ~20% rows are not Family A | **MEDIUM-HIGH (80%)** | Pattern consistency; no OCR baseline for Bidfood |
| Strict Option C safe if gates preserved | **MEDIUM (72%)** | Proven on 15 replay rows; stability/supplier hardcoded |
| Incorrect implementation damage scope | **HIGH (85%)** | 12 would_fix rows document blast radius |

**Overall audit confidence: MEDIUM-HIGH (78%)** — population mapping is complete; separation claims for untested rows remain inferential.

---

Artifacts:
- `.tmp/family-a-effective-paid-risk-audit/risk-population.json`
- `.tmp/family-a-effective-paid-risk-audit/audit.mts` (read-only analysis script)
