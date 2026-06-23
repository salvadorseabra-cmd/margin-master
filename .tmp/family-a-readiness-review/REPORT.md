# Family A — Implementation Readiness Review (READ-ONLY)

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Constraint: No code changes, DB writes, fixes, deployments, or prompt edits.

---

### Evidence Inventory

| Area | Status | Support |
|------|--------|---------|
| **Root Cause Localization** | **COMPLETE** | Pass C pre-Hybrid baseline qty=1 for Mezzi/Ricotta (`passc-refinement-validation`, `persistence-audit/pass-c-raw/f0aa5a08-*`); Hybrid H v25–v36 post-binding qty=2 (`final-validation-lab-rerun`, `edge-invoke-final.json` deploy v36); downstream qty invariant proven (`vl-final-state-audit`, `invoice-monetary-binding.ts` analysis in scope audit); mechanism documented: qty 1→2, total preserved, unit halved (~50% implied discount). |
| **Scope Analysis** | **COMPLETE** | 51 rows / 15 candidates audited (`family-a-scope-audit`); 2 failures (Mezzi + Ricotta) on 1 invoice / 1 supplier; 13/15 candidates correct; localized not systemic (HIGH 92%). |
| **Control Set** | **COMPLETE** | 12-row official regression suite frozen with OCR qty, current Hybrid H qty, expected qty (`family-a-correction-validation-plan/PLAN.md`, `family-a-fix-design/DESIGN.md`). |
| **Negative Controls** | **PARTIAL** | Gorgonzola differential documented as Emporio GPT variance, not Family A (`gorgonzola-root-cause/REPORT.md`: qty=2 intermittent, diff_pct≈34%, discounted row); Rolo documented as hardest same-invoice negative (9/10 stable qty=1). **Empirical negative replay in correction harness not executed.** |
| **Regression Dataset** | **COMPLETE** | Frozen v25 extracts, passc baselines, 10-run stability extracts (`final-stability-audit/extracts/f0aa5a08-*`), v36 fresh invoke (`family-a-v25-raw-capture/edge-invoke-final.json`). |
| **False Positive Analysis** | **PARTIAL** | Theoretical blast-radius and separating-signal analysis complete (`family-a-fix-design/DESIGN.md`); Gorgonzola/Rolo/Rulo Di Capra risks classified. **`effective-paid-contract-validation` shows Gorgonzola `would_fix: true` alongside Family A failures — empirical rule separation not proven.** |
| **Stability Testing** | **COMPLETE** | Mezzi 10/10 qty=2; Ricotta 10/10 qty=2; Pomodori 10/10 qty=1; Rolo 9/10 qty=1 (run 7 transient qty=2); Acqua 9/10 qty=2 (`final-stability-audit/extracts/f0aa5a08-all-runs.json`). |
| **Downstream Impact Mapping** | **COMPLETE** | Ricotta/Mezzi qty=1 vs qty=2 replay documented (`phase1-validation-forensics-result.json`); procurement masking proven; operational/procurement/history price pollution mapped (`effective-paid-contract-validation-result.json`); Ricotta usable stock doubles on wrong qty, Mezzi structure_total path unaffected. |
| **Validation Plan** | **COMPLETE** | Pass/fail criteria per field, validation order, explicit non-goals, global gates defined (`family-a-correction-validation-plan/PLAN.md`). **Plan execution not done.** |

---

### Rolo Risk Review

**Stability history:** 9/10 runs qty=1; **1/10 transient qty=2 on run 7** (`final-stability-audit`, v30 deploy). Run 7: qty=2, unit=12.187, total=12.17. All other runs qty=1 with totals 12.17–12.87. Mezzi/Ricotta: 10/10 qty=2 on every run.

**Similarities vs Ricotta (same invoice `f0aa5a08`):**
- OCR qty=1; undiscounted (blank DESC); blank CX column
- Weight token in description (Rolo `1KG`, Ricotta `1,5KG`)
- `unit_price ≈ total` at qty=1 (Rolo ~12.71=12.71)
- Same Bocconcino / IL BOCCONCINO template
- Good-path GPT raw cache emits qty=1 for both (`pass-c-raw/f0aa5a08-gpt-raw-cache.json`)

**Differences vs Ricotta:**
- Ricotta: decimal weight `1,5KG`; Mezzi-adjacent cluster differs
- Ricotta: **stable deterministic** qty=2 across v25–v36 and 10/10 runs
- Rolo: **stably correct** (9/10); transient qty=2 is run-luck not reproducible Family A pattern
- Rolo transient: total not cleanly locked at OCR unit×2 with ~50% halving signature (run 7 total 12.17 vs typical 12.71)
- Separating combo in scope audit explicitly **excludes Rolo** via `Hybrid H qty=1 (stable)`

**Similarities vs Mezzi:** Same invoice; both undiscounted blank-DESC rows. Mezzi has `(CX 1KG*6)` pack notation; Rolo bare `1KG`.

**Mezzi vs Pomodori differential (control):** Both CX+*N on Bocconcino; Pomodori has **20% DESC populated** (not blank); Pomodori 10/10 qty=1; Mezzi 10/10 qty=2. POMODORI guardrail covers discounted CX+*N only.

**Is Rolo a blocker?** **PROBABLY NO** for investigation completion or fix-design entry. Rolo is the documented boundary case for post-extraction (Option C) validation — a gate to execute, not a scope unknown. Transient qty=2 resembles Gorgonzola/Emporio GPT variance more than stable Family A.

---

### Implementation Gates

| Gate | Classification | Notes |
|------|----------------|-------|
| **Regression suite frozen** | **Already satisfied** | 12 official + 15 extended candidates with expected qty and frozen v25 baselines |
| **Pass/fail criteria defined** | **Already satisfied** | Per-field rules in `family-a-correction-validation-plan/PLAN.md` |
| **Downstream impact mapped** | **Already satisfied** | phase1 forensics + effective-paid + gross-net audits |
| **OCR / Pass C baseline** | **Already satisfied** | passc reextract qty=1; good-path GPT raw qty=1 for Mezzi/Ricotta |
| **Failure stability baseline** | **Already satisfied** | 10/10 qty=2 on Mezzi/Ricotta documented |
| **Control stability baseline** | **Already satisfied** | Pomodori/Rolo/Aviludo/Mammafiore controls stable in extracts |
| **Raw GPT capture (bad Hybrid H path)** | **Needs execution — blocker** | `artifact-index.json`: no archived raw GPT for v25+ bad path; v36 invoke returns post-binding only |
| **Offline replay validation** | **Needs execution — blocker** | Post-extraction rule replay on 15 candidates not run (`family-a-fix-design`: "replay not yet executed") |
| **Negative control replay (Gorgonzola + Rolo)** | **Needs execution — blocker** | Documented risks; no harness pass/fail results |
| **Correction strategy selection** | **Needs execution — blocker** | Options A/B/C/D analyzed; no chosen path validated |
| **Post-fix 10× Bocconcino stability** | **Needs execution** (if prompt path) | Mandatory before implementation if Option A/B |
| **Re-ingest / DB correction plan** | **Deferred** | Out of scope; DB already qty=2 |

---

### Remaining Unknowns

| Unknown | Severity | Blocks implementation? |
|---------|----------|------------------------|
| Does GPT emit qty=2 on bad path, or does binding inflate qty? | **Critical** | **Yes** — good-path GPT qty=1 proven; bad-path raw GPT absent; cannot finalize Option A vs C |
| Can post-extraction rule separate Mezzi/Ricotta from Gorgonzola? | **Critical** | **Yes** — Gorgonzola shares qty=2 + total-preserved + binding_changed; diff_pct 34% vs ~50%; `would_fix: true` for both |
| Can rule avoid false-positive on Rolo transient qty=2 (run 7)? | **Critical** (Option C) / **Medium** (Option A) | **Yes for Option C** — same-invoice undiscounted row with transient inflation signature |
| Post-extraction replay on 15-candidate set | **Critical** | **Yes** — no empirical proof any correction is safe |
| Correction strategy choice (A/B/C/D) | **Critical** | **Yes** |
| Prompt-only sufficiency for undiscounted blank-DESC rows | **Medium** | **Yes for Option A only** — POMODORI guardrail insufficient for Mezzi |
| Rolo 1/10 transient root cause | **Low** | **No** — monitoring only; not stable Family A |
| Ricotta VL ingredient linkage empty | **Low** | **No** |
| Re-ingest vs forward-only fix | **Low** | **No** — operational follow-on |

**Already resolved:** Family A localized to 2 rows; failure at Hybrid H/Pass C; downstream qty invariant; OCR qty=1 for failures; Gorgonzola is separate Emporio variance class.

---

### Readiness Verdict

**C) One final investigation required**

The diagnostic investigation arc is substantially complete: scope, localization, mechanism, controls, downstream impact, and validation criteria are proven and documented. One bounded final pass remains before fix design can be finalized or implementation started:

1. Capture Pass C raw structured JSON for Mezzi/Ricotta on current deploy (bad path).
2. Execute offline replay of candidate correction rule(s) on 15 candidates + Gorgonzola + Rolo negatives.
3. Document pass/fail against frozen criteria; select correction strategy based on replay results.
4. If prompt path chosen: 10× Bocconcino post-fix stability before implementation.

**Not ready for implementation (B).** Fix-design options exist (`family-a-fix-design/DESIGN.md`) but are explicitly provisional pending replay.

---

### Confidence

**Overall readiness assessment confidence: 86%**

| Claim | Confidence |
|-------|------------|
| Investigation arc completeness (diagnostic) | HIGH (91%) |
| Scope localization (Mezzi + Ricotta only) | HIGH (92%) |
| Root cause at Hybrid H / Pass C | HIGH (88%) |
| Rolo is not a scope blocker | HIGH (85%) |
| One final investigation sufficient vs significant rework | MEDIUM-HIGH (82%) |
| Verdict C (not A or D) | MEDIUM-HIGH (84%) |
