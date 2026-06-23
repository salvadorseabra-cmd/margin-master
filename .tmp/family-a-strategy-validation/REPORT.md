# Family A — Correction Strategy Validation (A vs C only)

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Constraint: NO code changes, NO DB writes, NO fixes, NO deployments — design validation only.

Evidence base: `family-a-fix-design/DESIGN.md`, `family-a-fix-design-review/REVIEW.md`, `family-a-correction-validation-plan/PLAN.md`, `family-a-readiness-review/REPORT.md`, `family-a-scope-audit/`, `family-a-v25-raw-capture/`, `final-validation-lab-rerun/extracts/`, `final-stability-audit/`, `effective-paid-contract-validation-result.json`, `gorgonzola-root-cause/`, `passc-prompt-audit/`, `phase1-validation-forensics-result.json`.

---

### Option A Analysis

**Definition:** Refine `TABLE_EXTRACTION_SYSTEM_PROMPT` in `invoice-table-extraction.ts` — add Pass C vision instructions for Bocconcino-style undiscounted rows with blank DESC, pack notation (`*6`, `1,5KG`), column-faithful QUANT reading. Existing POMODORI guardrail covers discounted CX+*N only.

#### Required assumptions

| # | Assumption |
|---|------------|
| A1 | Failure originates at GPT Pass C / Hybrid H, not at monetary binding (passc baseline qty=1 vs Hybrid H qty=2; binding preserves `quantity`). |
| A2 | GPT can be steered via prompt alone to emit qty=1 for Mezzi/Ricotta on every invoke (not just good-path cache). |
| A3 | Additional prompt text can be scoped narrowly to Bocconcino undiscounted blank-DESC rows without re-triggering broad pack-multiplier inference. |
| A4 | Good-path GPT raw cache (`pass-c-raw/f0aa5a08-gpt-raw-cache.json`: Mezzi/Ricotta qty=1) is representative of achievable post-fix behaviour. |
| A5 | POMODORI negative-example precedent generalises to Mezzi (undiscounted, no DESC column) with new instructions only. |
| A6 | Post-fix 10× Bocconcino stability will reach ≥9/10 qty=1 for Mezzi/Ricotta (currently 10/10 qty=2 on v25–v36). |
| A7 | Prompt fix propagates cleanly: unit_price, effective_paid, stock normalization inherit correct qty without secondary rules. |
| A8 | Mammafiore `*2` controls (Aceto, Rulo Di Capra) will not regress — prior `passc-prompt-audit` counterfactuals (qty 1→2) were caused by over-broad pack rules, avoidable by narrow scoping. |
| A9 | Raw GPT on bad Hybrid H path emits qty=2 (not binding inflation) — **unproven**; bad-path raw capture absent (`artifact-index.json`). |

#### Failure modes while fixing Ricotta (breaking controls)

| Control | Risk if A fires wrong | Mechanism | Evidence |
|---------|----------------------|-----------|----------|
| **Pomodori** | LOW | Has DESC 20% + existing POMODORI guardrail; adjacent CX+*N row | 10/10 qty=1 stability; guardrail in prompt L131–135 |
| **Rolo** | LOW–MEDIUM | Same invoice, undiscounted, weight token `1KG`, blank CX — broad "read QUANT not pack" rules could interact with GPT variance | 9/10 stable qty=1; run 7 transient qty=2 |
| **Gorgonzola** | LOW | Different supplier (Emporio), different layout, discounted row | Emporio GPT variance class; not Family A |
| **Acqua** | LOW | qty=2 is column-faithful OCR; not 1→2 inflation | passc + v25 + v36 all qty=2 |
| **Mammafiore** (Aceto, Rulo) | **MEDIUM** | Broad pack-notation prompt rules historically caused qty 1→2 on `*2` rows | `passc-prompt-audit/counterfactual-analysis.json`; prompt L159–164 already has Aceto/Rulo negatives but raw runs still showed qty=2 intermittently |

---

### Option C Analysis

**Definition:** Deterministic post-extraction quantity validation — detect qty-inflation signature (extracted qty>1, total preserved, `unit_price ≈ total at qty=1`, undiscounted, pack notation) and correct quantity. Placement: new gate after Pass C / before or after binding (distinct from extending `applyEffectivePaidPrice` alone).

#### Required assumptions

| # | Assumption |
|---|------------|
| C1 | Qty inflation signature is observable and correctable deterministically from structured fields (no column OCR required). |
| C2 | Minimum separating combination can be encoded: OCR-proxy qty=1 AND Hybrid H qty=2 (stable) AND undiscounted blank DESC AND unit≈total at qty=1 AND IL BOCCONCINO template (`family-a-scope-audit`). |
| C3 | `diff_pct` threshold can separate Family A failures (~50%) from Gorgonzola (~34%) — **empirically unproven** (`effective-paid-contract`: both `would_fix: true`). |
| C4 | Supplier/template scoping to IL BOCCONCINO eliminates Mammafiore/Aviludo/Bidfood false positives. |
| C5 | Downstream pipeline does not modify `quantity` post-extraction (proven: `invoice-monetary-binding.ts`, vl-final-state-audit). |
| C6 | Frozen v25 extracts (`final-validation-lab-rerun/extracts/`) are valid replay inputs for rule proof. |
| C7 | Correcting qty to 1 restores unit_price (~total) and fixes Ricotta usable stock (1500g not 3000g) — proven by `phase1-validation-forensics` qty=1 vs qty=2 replay. |
| C8 | Rule will not fire on legit multi-qty rows (Acqua qty=2) or discounted rows (Pomodori, Mozzarella). |
| C9 | Rolo run-7 transient qty=2 can be excluded without blocking Ricotta fix — **unproven** (same invoice, undiscounted, weight token). |
| C10 | Gorgonzola qty=2/total-preserved runs (6/10 stability at qty=2 with total=13.44) will not be incorrectly corrected — **critical unproven**. |

#### Failure modes while fixing Ricotta (breaking controls)

| Control | Risk if C fires wrong | Mechanism | Evidence |
|---------|----------------------|-----------|----------|
| **Pomodori** | LOW | Discounted (DESC 20%); combo trigger excludes blank-DESC undiscounted pattern | `binding_changed` discount path; 10/10 qty=1 |
| **Rolo** | **MEDIUM–HIGH** | Run 7: qty=2, undiscounted, same invoice, total≈12.17; shares failure profile on bad runs | `f0aa5a08-run7.json`: Rolo qty=2, unit=12.187, total=12.17 |
| **Gorgonzola** | **CRITICAL** | qty=2, total=13.44 preserved, `binding_changed=true`, `diff_pct≈34%`; `would_fix: true` in effective-paid audit | 6/10 stability runs qty=2 with total=13.44; different failure class (Emporio GPT variance) |
| **Acqua** | LOW | OCR qty=2; not 1→2 inflation signature | Column-faithful qty=2 |
| **Mammafiore** (Aceto, Rulo) | LOW (if Bocconcino-scoped) / MEDIUM (if global) | qty=1 stable 10/10; `*2` pack ambiguity | `36c99d19-all-runs.json`: Aceto/Rulo 10/10 qty=1; supplier differs |

---

### Failure Modes

#### Option A — Ricotta fixed, control broken

1. **Mammafiore Aceto/Rulo qty 1→2:** Broad pack-multiplier prompt language re-triggers `*2` inference (`passc-prompt-audit`: documented counterfactuals).
2. **Mezzi over-corrected alongside Ricotta:** Shared undiscounted blank-DESC class; if prompt too aggressive on `*6`, could affect future Pomodori-class rows losing discount context.
3. **Rolo transient worsened:** Prompt changes increase GPT variance on same-invoice undiscounted weight-token rows (run 7 already shows qty=2 once).
4. **Acqua qty 2→1:** Unlikely with narrow scope; would require rule conflating pack `*15` with purchased quantity (prompt already has Acqua negative example L113–116).
5. **Non-deterministic regression on re-upload:** Fix passes 10× gate once but fails on future invokes (Gorgonzola precedent: GPT variance class).

#### Option C — Ricotta fixed, control broken

1. **Gorgonzola qty 2→1:** Rule matches qty=2 + total-preserved + binding_changed; `would_fix: true` alongside Mezzi/Ricotta; operational cost would halve incorrectly (`effective-paid-contract`: diff_pct 34% vs 50%).
2. **Rolo run-7 false positive:** Transient qty=2 on same invoice with undiscounted profile; unit halved pattern differs (~50% vs Rolo run-7) but rule may still fire if threshold too loose.
3. **Global rule hits Emporio/Bidfood discounted fractional rows:** 12/15 flagged rows `would_fix` in effective-paid audit — broad rule risks unrelated rows.
4. **Acqua false positive:** Only if rule ignores OCR-proxy qty=2; documented as LOW.
5. **Pomodori path broken:** Only if discount guard omitted; DESC-populated row should be excluded.

---

### Validation Evidence

| Evidence type | Option A | Option C |
|---------------|----------|----------|
| **Root cause localization** | ✅ Complete — Pass C divergence proven | ✅ Complete — symptom signature documented |
| **12-row regression suite frozen** | ✅ | ✅ |
| **Frozen v25 extracts** | ✅ (baseline comparison) | ✅ (direct replay input) |
| **Pass C baseline (qty=1 failures)** | ✅ | ✅ (OCR proxy) |
| **Good-path GPT raw (qty=1)** | ✅ | N/A (symptom fix) |
| **Bad-path GPT raw** | ❌ Missing — blocker | N/A |
| **10-run stability (failures)** | ✅ 10/10 qty=2 documented | ✅ (input state for replay) |
| **10-run stability (controls)** | ✅ Pomodori/Rolo/Acqua/Mammafiore | ✅ |
| **Gorgonzola negative** | ✅ Documented (different class) | ⚠️ Partial — `would_fix: true` confounds separation |
| **Rolo negative** | ⚠️ 9/10 stable; run 7 documented | ⚠️ Run 7 is primary C risk |
| **Downstream impact replay** | ✅ phase1 + effective-paid | ✅ phase1 + effective-paid |
| **Offline rule replay executed** | N/A | ❌ Not done — blocker |
| **Post-fix stability** | ❌ Not done | ❌ Not done (if coupled) |
| **Prompt counterfactual audit** | ✅ passc-prompt-audit (regression risk) | N/A |

**Missing for A:** bad-path raw GPT capture; post-prompt 10× stability; empirical proof narrow scope avoids Mammafiore regression.

**Missing for C:** offline replay on 15 candidates + Gorgonzola + Rolo negatives; empirical proof `diff_pct` or supplier scope separates Gorgonzola; rule definition not frozen.

---

### Blast Radius Comparison

| Category | Option A | Option C |
|----------|----------|----------|
| **Determinism** | **LOW** — GPT non-deterministic; Mezzi/Ricotta 10/10 qty=2 today is stable wrong, but post-fix behaviour unknown | **HIGH** — rule is deterministic given extract input |
| **Replayability** | **LOW** — requires live GPT invokes; frozen extracts cannot prove post-prompt output | **HIGH** — frozen v25 + passc baselines enable offline replay without deploy |
| **Regression confidence** | **MEDIUM-LOW** — 12-row suite exists but proof requires new behaviour; prior prompt regressions documented | **MEDIUM** — suite exists; replay path documented but **not executed**; Gorgonzola `would_fix` undermines confidence |
| **Supplier specificity** | **Configurable** — narrow Bocconcino scope LOW blast; broad pack rules HIGH (Mammafiore) | **Configurable** — Bocconcino scope LOW; global rule HIGH (12/15 `would_fix`) |
| **Dependence on GPT behaviour** | **TOTAL** — fix IS GPT behaviour change | **NONE for rule proof** — operates on structured output; GPT may still emit qty=2, rule corrects |
| **Control: Pomodori** | LOW | LOW |
| **Control: Rolo** | LOW–MEDIUM | MEDIUM–HIGH |
| **Control: Gorgonzola** | LOW | MEDIUM–HIGH |
| **Control: Acqua** | LOW | LOW |
| **Control: Mammafiore** | MEDIUM | LOW (scoped) / MEDIUM (global) |

---

### Decision Readiness

| Option | Selectable today? | Evidence |
|--------|-------------------|----------|
| **A) Hybrid H prompt** | **NO** | Good-path GPT qty=1 proves capability, not bad-path fix. No bad-path raw capture. v36 edge invoke still qty=2 post-binding. Prompt-only sufficiency for undiscounted blank-DESC rows assessed LOW (40%). Mandatory 10× post-fix stability not run. Prior Aceto/Rulo counterfactuals document regression surface. |
| **C) Post-extraction qty validation** | **NO** | Offline replay **not executed** (`family-a-fix-design`: "replay not yet executed"). Gorgonzola `would_fix: true` alongside Family A failures — separation unproven (confidence LOW 35%). Rolo run-7 boundary unproven. Rule definition and threshold not frozen. |

**Provability comparison (existing evidence only, no new GPT behaviour):**

- **Option C** can be validated offline using frozen extracts + regression suite — validation **pathway exists**, execution pending.
- **Option A** **cannot** be proven safe without new GPT behaviour (prompt edit + live re-extract + 10× stability).

Neither option meets decision gates today. C has stronger **provability architecture** with existing artifacts; A has stronger **root-cause alignment** but weaker **evidence closure**.

---

### Confidence

| Claim | Confidence | Basis |
|-------|------------|-------|
| Family A localized to Mezzi + Ricotta | HIGH (92%) | 51 rows, 13/15 correct, 10/10 failure stability |
| Root cause at Hybrid H / Pass C | HIGH (88%) | passc qty=1; downstream qty invariant |
| C provable offline without new GPT | HIGH (85%) | Frozen extracts + documented replay path |
| A provable without new GPT | LOW (15%) | Inherently requires prompt change + live invokes |
| C rule safely separates Gorgonzola/Rolo | LOW (35%) | Replay not executed; `would_fix: true` for Gorgonzola |
| A narrow prompt avoids Mammafiore regression | MEDIUM (55%) | Counterfactuals exist; Aceto/Rulo negatives in prompt today |
| Either selectable today | **NO** | Both blocked per readiness verdict C |
| C safer to **prove** with existing evidence | MEDIUM-HIGH (78%) | Deterministic replay path ready; A requires behaviour change |
| A safer to **implement** (root cause) | Not assessed — evidence-only scope | — |

**Overall validation confidence: 82%** — scope and pass criteria are strong; correction-strategy selection blocked until offline C replay + (for A) bad-path capture and post-fix stability.
