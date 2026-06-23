# Family A Correction — Read-Only Validation Plan

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Scope: 51 rows audited, 15 candidates, 2 failures (Mezzi + Ricotta), 1 invoice (`f0aa5a08`), 1 supplier (IL BOCCONCINO)  
Constraint: **NO code changes, NO DB writes, NO fixes, NO deployments** — planning only.

---

### Regression Suite

Official 12-row suite. Sources: `family-a-scope-audit/audit-result.json`, `passc-refinement-validation/reextract/`, `final-validation-lab-rerun/extracts/` (v25), `family-a-v25-raw-capture/edge-invoke-final.json` (v36), `final-stability-audit/extracts/f0aa5a08-*`, `field-accuracy-audit/ground-truth.json` (Pomodori visible QUANT).

| Product | Invoice | OCR Qty | Current Hybrid H Qty | Expected Qty | Evidence |
|---------|---------|---------|----------------------|--------------|----------|
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | Bocconcino `f0aa5a08` | **1** | **2** | **1** | passc reextract qty=1; v25/v36/10-run stability qty=2 |
| **RICOTTA TREVIGIANA 1,5KG** | Bocconcino `f0aa5a08` | **1** | **2** | **1** | passc reextract qty=1; v25/v36/10-run stability qty=2 |
| POMODORI PELATI (CX 2,5KG*6) | Bocconcino | 1 (visible `QUANT.=1,000`) | 1 | 1 | v25 extract + 10/10 stability; GT catalog qty=2 is catalog error |
| ROLO DE CABRA E VACA 1KG | Bocconcino | 1 | 1 | 1 | v25 extract qty=1; stability 9/10 qty=1 (1/10 run qty=2 transient) |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Bocconcino | 2 | 2 | 2 | passc + v25 + v36 all qty=2; column-faithful |
| MOZZARELLA FIOR DI LATTE 125GR*8 | Bocconcino | 10 | 10 | 10 | passc + v25 qty=10; discounted row |
| Arroz Agulha Metro Chef 12x1 kg | Aviludo May `3b4cb21f` | 1 | 1 | 1 | passc + v25 qty=1 |
| Açúcar Branco METRO Chef 10x1 Kg | Aviludo May | 1 | 1 | 1 | passc qty=1; v25 qty=1 |
| Pepinos Extra Uli Frasco 6x720 g | Aviludo May | 1 | 1 | 1 | passc + v25 qty=1 |
| Aceto balsamico pet 5l*2 Toschi | Mammafiore `36c99d19` | 1 | 1 | 1 | passc + v25 qty=1; `*2` pack notation control |
| Rulo Di Capra 1kg*2 Simonetta | Mammafiore | 1 | 1 | 1 | passc + v25 qty=1; `*2` pack notation control |
| Farina Speciale pizza 25kg Amoruso | Mammafiore | 1 | 1 | 1 | passc + v25 qty=1; separate Farina total bug out of Family A scope |

**Extended candidate pool (15 rows):** add Bidfood Ovo Cx.15, Aviludo April Pepinos/Arroz/Açúcar/Mozzarella 2Kg (v28 extracts; v25 April 0-item flake excluded from pass/fail).

**Stability gates (Bocconcino failures):** Mezzi 10/10 qty=2; Ricotta 10/10 qty=2 (`final-stability-audit/extracts/f0aa5a08-all-runs.json`).

**Pass/fail at extraction layer:**
- **FAIL (must fix):** Mezzi, Ricotta — `quantity` must become 1.
- **PASS (must not change quantity):** all 10 controls above.

---

### Pass Criteria

Per-row rules after a future correction is applied. Compare **post-correction replay** against **frozen v25 control baselines** (`final-validation-lab-rerun/extracts/`, `passc-refinement-validation/reextract/`).

#### A. Failure rows (Mezzi, Ricotta) — MUST change

| Field | Current (wrong) | Must become | Pass rule |
|-------|-----------------|-------------|-----------|
| `quantity` | 2 | 1 | `quantity === 1` |
| `unit` | `uni`/`un` | unchanged | same normalized unit family |
| `total` | 27.30 / 7.97 | unchanged | `abs(delta) < €0.02` |
| `unit_price` (bound) | 13.65 / 3.99 (halved) | ~27.36 / ~7.97 | `unit_price ≈ total` at qty=1 (within 1%) |
| `effective_paid` / implied discount | ~50% (`diff_pct` 0.499–0.500) | ~0% | `implied_discount_pct < 5%` |
| `purchaseContainerCount` | 2 | 1 | matches qty=1 replay (`phase1-validation-forensics`) |
| `normalizedUsableQuantity` | 6000g / 3000g | 6000g / 1500g | Ricotta halves on wrong qty (`gross-net-global-audit`) |
| `usableStockLabel` | "6 kg" / "3 kg" | "6 kg" / "1.5 kg" | presentation strings from forensics replay |
| `effectiveCost` (per kg usable) | €4.55 / €2.66 | €4.55 / €5.31 | operational usable cost restored |
| `operational.current_price` | 13.65 / 3.99 | 27.36 / 7.97 | matches passc baseline unit |
| `procurement.current_price` | 13.65 / 3.99 | 27.36 / 7.97 | procurement no longer masks via halved unit |
| `procurement.purchase_quantity` | 1 | 1 | unchanged (already correct per `resolveCountablePurchaseQuantityForCost`) |
| `history.new_price` | 13.65 / 3.99 | 27.36 / 7.97 | effective-paid-contract: history polluted today |

#### B. Control rows — MUST remain unchanged

For Pomodori, Rolo, Acqua, Mozzarella, Arroz, Açúcar, Pepinos, Aceto, Rulo, Farina (and all 13/15 non-failure candidates):

| Field | Pass rule |
|-------|-----------|
| `quantity` | **exact match** to v25 Hybrid H baseline |
| `unit` | exact match |
| `total` | `abs(delta) < €0.02` |
| `unit_price` | `abs(delta) < €0.02` or unchanged binding path |
| `discount_pct` / binding flags | unchanged (Pomodori must keep DESC discount path) |
| `purchaseContainerCount` | unchanged |
| `normalizedUsableQuantity` / `usableStockLabel` | unchanged |
| `effectiveCost` | unchanged |
| `operational.current_price` | unchanged |
| `procurement.*` | unchanged |
| `binding_changed` flag | unchanged for controls where `binding_changed=false` today (Aceto) |

#### C. Global gates

| Gate | Pass rule | Fail rule |
|------|-----------|-----------|
| Candidate regression | 13/13 non-failure candidates unchanged | any control qty drift |
| Bocconcino 10-run stability | Mezzi/Ricotta qty=1 in ≥9/10 runs; controls stable | Mezzi/Ricotta still qty=2 in majority |
| Gorgonzola negative (Emporio) | qty=2 preserved when legit (discounted) | qty forced to 1 on Gorgonzola |
| Rolo negative (same invoice) | qty=1 in ≥9/10 runs | qty corrected to 1 on transient qty=2 runs incorrectly |
| Invoice total | Bocconcino €290.64 unchanged | line-sum drift |
| Line-total arithmetic | `qty × unit_price ≈ total` within €0.05 for all rows | closure break |

#### D. Explicit non-goals for Family A validation

- Do **not** use GT catalog qty=2 for Pomodori as pass criterion (visible invoice qty=1; `family-a-scope-audit` documents GT error).
- Do **not** require fixing Farina €1 total variance (separate deterministic bug, `final-stability-audit`).
- Do **not** treat `procurement.purchase_quantity=1` on failures as proof of correctness (masks symptom per `phase1-validation-forensics`).

---

### Secondary Risks

If Ricotta/Mezzi `quantity` is corrected 2→1, downstream fields that **will change** (evidence: `phase1-validation-forensics-result.json`, `gross-net-global-audit-output.json`, `effective-paid-contract-validation-result.json`):

#### Ricotta (qty 2→1)

| Layer | Current (qty=2) | After correction | Risk |
|-------|-----------------|------------------|------|
| `purchaseContainerCount` | 2 | 1 | **HIGH** — scales with generic `un` row (`resolvePurchaseContainerCount`) |
| `normalizedUsableQuantity` | 3000g | 1500g | **HIGH** — `fallbackReason: generic row unit × per-item (2 × 1.5 kg)` |
| `usableStockLabel` | "3 kg usable" | "1.5 kg usable" | **HIGH** — UI stock display |
| `effectiveCost` | €2.66/kg | €5.31/kg | **HIGH** — recipe/margin cost doubles |
| `operational.current_price` | €3.99 | €7.97 | **HIGH** — ingredient cost halved incorrectly today |
| `procurement.current_price` | €3.99 | €7.97 | **MEDIUM** — display; `purchase_quantity` stays 1 |
| `history.new_price` | €3.99 | €7.97 | **MEDIUM** — re-ingest would rewrite history |
| `total` | €7.97 | €7.97 | **NONE** — preserved |
| `purchaseQty` (countable resolver) | 1 | 1 | **NONE** — already masked |

#### Mezzi (qty 2→1)

| Layer | Current (qty=2) | After correction | Risk |
|-------|-----------------|------------------|------|
| `purchaseContainerCount` | 6 (inner) × 2 (outer) | 6 × 1 | **MEDIUM** — Mezzi uses `structure_total` path; `totalUsableAmount` stays 6000g at both qty=1 and qty=2 per `gross-net-global-audit` (`fallbackReason: name N×SIZE total is final`) |
| `normalizedUsableQuantity` | 6000g | 6000g | **LOW** — structure_total path does not rescale |
| `usableStockLabel` | "6 kg usable" | "6 kg usable" | **LOW** |
| `effectiveCost` | €4.55/kg | €4.55/kg | **LOW** — usable cost unchanged |
| `operational.current_price` | €13.65 | €27.36 | **HIGH** — unit price doubles |
| `procurement.current_price` | €13.65 | €27.36 | **HIGH** — ingredient `current_price` 27.31 vs replay 13.65 today (`effective-paid-contract`) |
| `ingredient.current_price` | €27.31 (Paccheri ingredient) | €27.36 expected | **HIGH** — procurement_match false today |
| `history.new_price` | €13.65 | €27.36 | **MEDIUM** |

#### Cross-cutting risks if correction rule is too broad

| Risk | Evidence | Severity |
|------|----------|----------|
| Gorgonzola false positive | qty=2, total=13.44, `diff_pct≈34%`, 6/10 runs qty=2 (`effective-paid-contract`, `final-stability-audit`) | **CRITICAL** |
| Rolo false positive | same invoice, undiscounted, weight token; 1/10 run qty=2 with total preserved (`family-a-scope-audit`) | **HIGH** |
| Rulo Di Capra / Aceto `*2` rows | pack multiplier ambiguity; qty=1 stable (`family-a-scope-audit`) | **MEDIUM** |
| Mammafiore broad pack rules | prior Aceto/Rulo `1→2` counterfactuals (`family-a-fix-design/DESIGN.md`) | **MEDIUM** |
| Procurement display drift on unrelated rows | `effective-paid-contract`: 12/15 flagged rows `would_fix` | **LOW** for Family A scope; rule must not broaden |

#### Fields that do NOT change on correction (proven)

- `total` line amounts (binding preserves total; `applyEffectivePaidPrice` only adjusts `unit_price`)
- Downstream pipeline does not modify `quantity` post-extraction (`invoice-monetary-binding.ts`; vl-final-state-audit)

---

### Validation Order

Safest order to prove a future correction before any production write:

```
1. Extraction replay (offline)
   └─ Frozen v25 extracts + passc baselines; no GPT variance
2. Binding / post-extraction rule (if Option C)
   └─ Replay bindMonetaryColumns → finalizeExtractedLineItems on 15 candidates
3. Extraction live stability (if Option A/B)
   └─ 10× Bocconcino invoke; 1× each control invoice
4. Invoice line persistence (read-only diff)
   └─ Compare replay output vs DB `invoice_items` for f0aa5a08
5. Stock normalization replay
   └─ normalizePurchasedToUsableStock qty=1 vs qty=2 (`stock-normalization.ts`)
6. Procurement projection
   └─ resolveCountablePurchaseQuantityForCost + procurement display builders
7. Operational cost / ingredient.current_price
   └─ effective-paid-contract replay per affected ingredient
8. Price history projection
   └─ history.new_price diff only; no DB write
```

**Rationale (evidence-backed):**

| Step | Why first | Source |
|------|-----------|--------|
| Extraction replay before live | All 15 candidates have frozen v25 JSON; deterministic; no deploy risk | `family-a-fix-design/DESIGN.md` Option C |
| Binding before invoice | `quantity` set at Pass C; binding never touches qty today — any qty fix is provably additive | `invoice-monetary-binding.ts`, scope audit |
| Invoice before ingredient | DB already has qty=2; ingredient link may be empty for Ricotta (`phase1` ingredients: []) | phase1 forensics |
| Normalization before procurement | `purchaseContainerCount` and usable qty are pure functions of row qty + name | `gross-net-global-audit`, `stock-normalization.ts` |
| Procurement before operational | `purchase_quantity` already masks failures; validate display separately | phase1 forensics `purchaseQty: 1` at qty=2 |
| History last | Lowest reversibility; polluted today but no recipe impact (recipe_count=0 for Paccheri) | effective-paid-contract |

**Alternative order (prompt-only fix):** swap steps 1–2 with step 3 first (10-run stability mandatory before any downstream replay). Evidence: passc baseline qty=1 proves GPT can emit correct qty; Hybrid H is non-deterministic.

**Gate between phases:** do not proceed to step 5+ until steps 1–3 pass on all 12 official rows + Gorgonzola negative.

---

### Remaining Unknowns

| Unknown | Classification | Evidence |
|---------|----------------|----------|
| Does GPT emit qty=2 or does binding inflate qty? | **Critical blocker** | `artifact-index.json`: no archived raw GPT for v25 bad path; good-path pass-c-raw shows qty=1; v36 edge invoke returns post-binding qty=2 |
| Can post-extraction rule separate Mezzi/Ricotta from Gorgonzola? | **Critical blocker** | Gorgonzola shares qty=2 + total-preserved + binding_changed; `diff_pct` 34% vs 50% for failures |
| Can rule separate from Rolo transient qty=2? | **Critical blocker** | Rolo 1/10 stability qty=2 with total preserved; same invoice, undiscounted |
| Post-extraction replay on 15-candidate set not yet executed | **Critical blocker** | `family-a-fix-design`: "replay not yet executed" |
| Ricotta ingredient linkage in VL | **Nice-to-know** | `phase1-validation-forensics`: `ingredients: []` for Ricotta |
| Rolo 1/10 transient qty=2 root cause | **Nice-to-know** | stability audit; not stable Family A |
| Whether re-ingest is required vs forward-only fix | **Nice-to-know** | DB already qty=2; correction at extraction does not auto-heal persisted rows |
| Prompt-only sufficiency for undiscounted blank-DESC rows | **Nice-to-know** | POMODORI guardrail covers discounted rows only |
| Family A localized to 2 rows | **Already resolved** | 13/15 candidates correct; 10/10 stability on failures |
| Downstream does not modify quantity | **Already resolved** | passc vs Hybrid H divergence; binding preserves qty |
| Failure mechanism: qty doubled, total preserved, unit halved | **Already resolved** | scope audit, gross-net audit, phase1 forensics |
| OCR qty=1 for failures | **Already resolved** | passc reextract + bocconcino-investigation first ingest |

---

### Implementation Readiness

| Prerequisite | Status | Blocker? |
|--------------|--------|----------|
| Regression dataset frozen (12 official + 15 candidate) | ✅ Ready | No |
| Pass/fail criteria defined per field | ✅ Ready | No |
| Downstream impact mapped (forensics + gross-net + effective-paid) | ✅ Ready | No |
| Frozen v25 extracts for replay | ✅ Ready | No |
| Pass C baseline for OCR proxy | ✅ Ready | No |
| Raw GPT capture for bad Hybrid H path | ❌ Missing | **Yes** |
| Post-extraction rule replay executed | ❌ Not done | **Yes** |
| Gorgonzola / Rolo negative test in replay harness | ❌ Not done | **Yes** |
| Correction strategy chosen (A/B/C/D) | ❌ Design only | **Yes** |
| Bocconcino 10-run post-fix stability | ❌ Not done | **Yes** (if prompt path) |
| Re-ingest / DB correction plan | ❌ Out of scope | Deferred |

**Readiness verdict: NOT READY for implementation.**

Minimum path to readiness (validation only, no fixes):
1. Capture Pass C raw structured JSON for Mezzi/Ricotta on current deploy (`family-a-v25-raw-capture` gap).
2. Execute offline replay of candidate correction rule on 15 rows + Gorgonzola + Rolo negatives.
3. Document pass/fail against criteria in section B.
4. If replay passes, run 10× Bocconcino stability before any implementation decision.

---

### Confidence

| Claim | Confidence | Basis |
|-------|------------|-------|
| Family A is localized (Mezzi + Ricotta only) | **HIGH (92%)** | 13/15 candidates correct; 10/10 failure stability; 1/6 invoices |
| Root cause is Hybrid H extraction inflation | **HIGH (88%)** | passc qty=1 vs Hybrid H qty=2; downstream qty invariant |
| Validation plan is sufficient to prove safety | **MEDIUM (78%)** | Depends on unresolved Gorgonzola/Rolo separation in replay |
| Post-extraction correction can be validated offline first | **HIGH (85%)** | Frozen extracts + binding replay path documented |
| Prompt-only fix can be validated without downstream risk | **MEDIUM (65%)** | GPT variance; prior pack-rule regressions |
| Correcting qty will restore operational/procurement prices | **HIGH (90%)** | phase1 qty=1 vs qty=2 replay shows exact restoration |
| Mezzi usable stock unaffected by qty fix | **HIGH (85%)** | `structure_total` path; gross-net audit |
| Ricotta usable stock will change on qty fix | **HIGH (95%)** | purchaseContainerCount 2→1; 3000g→1500g proven |

**Overall validation-plan confidence: HIGH (82%)** — evidence is strong for scope and pass criteria; implementation blocked by three critical unknowns (GPT origin, Gorgonzola separation, replay execution).
