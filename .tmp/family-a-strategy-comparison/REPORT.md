# Family A Strategy Comparison — Binding (Option C) vs Extraction Source (Hybrid H)

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no fixes, no deployments  
**Scope:** Ricotta + Mezzi (Family A) only  
**Evidence base:** Completed investigations listed in synthesis sources

---

## Approach Definitions

| Label | Investigation mapping | Correction locus |
|-------|----------------------|------------------|
| **Approach A** | Option C — post-extraction binding gate | `bindMonetaryColumns` in `invoice-monetary-binding.ts` |
| **Approach B** | Hybrid H extraction source — prompt and/or schema at table GPT pass | `TABLE_EXTRACTION_SYSTEM_PROMPT` + `TABLE_EXTRACTION_RESPONSE_FORMAT` in `invoice-table-extraction.ts` (`callOpenAiJson`) |

**Known failure state:** PDF/OCR/Pass C baseline qty=1 → Hybrid H qty=2 (10/10 stable) on invoice `f0aa5a08`; first incorrect value at Hybrid H table GPT pass, not downstream (`family-a-transition-trace/`, `ricotta-root-cause-trace/`, `mezzi-root-cause-trace/`).

---

## Executive Comparison

| Dimension | Approach A — Binding (Option C) | Approach B — Extraction Source (Hybrid H) | Evidence winner |
|-----------|--------------------------------|-------------------------------------------|-----------------|
| **Complexity** | Medium — deterministic rule + proxy mapping for 3 investigation-only gates | High — prompt/schema interaction (45%), non-deterministic GPT, narrow scoping required | A (lower implementation complexity) |
| **Runtime dependencies** | `bindMonetaryColumns`, `discount_pct` at edge memory, supplier threading, binding replay cluster | Live GPT invokes, prompt/schema bundle, OpenAI variance | A (fewer external deps for offline proof) |
| **Investigation-only signals required** | **3 of 6** documented combo gates RED; runtime proxy drops 2 gates | Bad-path GPT raw missing; post-fix 10× stability not run; prompt counterfactuals from prior audits | Tie — both depend on investigation artifacts |
| **Blast radius** | All invoices through binding if global; **12/15** effective-paid rows `would_fix` unscoped; Bocconcino-scoped LOW | All invoices through Pass C if prompt broadened; **MEDIUM** Mammafiore `*2` regression history | B (narrower if Bocconcino-scoped prompt) |
| **Validation effort** | Offline replay **100%** recall/precision on documented rule; runtime proxy **92.3%** precision (1 FP Rolo run 7) | Cannot prove with frozen extracts; requires prompt edit + live re-extract + 10× stability | A (provability architecture) |
| **Long-term maintainability** | Symptom patch — GPT may still emit qty=2; dual-layer (GPT wrong + binding correct) | Root-cause alignment — qty authored correctly at source; single foundation | B (foundation fix) |

---

## 1. Complexity

### Approach A — Binding (Option C)

| Aspect | Finding | Evidence |
|--------|---------|----------|
| Rule type | Deterministic post-GPT gate before `applyEffectivePaidPrice` | `family-a-fix-design/DESIGN.md` Option C; `family-a-implementation-prep/REPORT.md` §Implementation Target |
| Documented trigger | 6-signal combo AND `qty_inflation_signature` | `family-a-option-c-replay/REPORT.md` §Reconstructed Option C Signals |
| Runtime adaptation | Must replace 3 investigation gates with proxies; proposed rule is **different** from validated rule | `family-a-implementability-audit/REPORT.md` Task 7; `family-a-runtime-equivalence/REPORT.md` §Conservative runtime proxy |
| Code touch surface | Primary: `invoice-monetary-binding.ts`; conditional: supplier threading via `index.ts` / `invoice-table-extraction.ts` | `family-a-implementation-prep/REPORT.md` §Change Surface |
| Gorgonzola separation | Requires supplier + OCR≠1 + discount + `diff_pct≥45%` stack; threshold drift ≤0.30 widens risk | `family-a-option-c-replay/REPORT.md` §Gorgonzola Analysis; `combo-stress-result.json` |

**Verdict:** Medium complexity — rule logic is deterministic, but shipping requires proxy redesign not identical to offline-validated combo.

### Approach B — Extraction Source (Hybrid H)

| Aspect | Finding | Evidence |
|--------|---------|----------|
| Root cause locus | Stage 4 — `callOpenAiJson` emits qty=2; downstream qty-invariant (91% confidence) | `family-a-transition-trace/REPORT.md` §Quantity Mutation Locations; `family-a-implementation-prep/readiness.json` |
| Causal model | **Interaction primary (45%)** — prompt+schema joint trigger on undiscounted Bocconcino blank-DESC rows | `family-a-causal-attribution/REPORT.md` §Probability Attribution |
| Prompt delta | ~250 lines Hybrid H vs ~125 Pass C; net **anti-inflation** rules yet Mezzi/Ricotta still qty=2 | `family-a-hybrid-diff-attribution/REPORT.md` §Prompt Differences |
| Isolation | passc-refinement 7-row reextract qty=1 vs v25 Hybrid H 7-row qty=2 — same crop, different deploy bundle | `family-a-hybrid-diff-attribution/REPORT.md` §Crop isolation control |
| Scoping tension | Narrow Bocconcino undiscounted pattern vs broad pack rules caused prior Aceto/Rulo qty 1→2 counterfactuals | `family-a-fix-design/DESIGN.md` §Option A; `family-a-strategy-validation/REPORT.md` §Option A Analysis A8 |

**Verdict:** High complexity — must address prompt/schema interaction without re-breaking Mammafiore `*2` controls; non-deterministic outcome space.

---

## 2. Runtime Dependencies

### Approach A — Binding (Option C)

| Signal | Runtime status | Class | Evidence |
|--------|---------------|-------|----------|
| `hybrid_h_qty_eq_2` | **Yes** — GPT `quantity` unchanged through bind | GREEN | `family-a-implementability-audit/signals.json` |
| `supplier_il_bocconcino` | **Yes** — Pass B; **not threaded to bind today** | GREEN (conditional wiring) | `family-a-runtime-equivalence/REPORT.md` §Signal inventory |
| `unit_price_approx_total_at_qty1` | **Yes** — at bind input | GREEN | `signals.json` |
| `discount_pct` (proxy for blank DESC) | **Partial** — edge memory only; stripped before persist | RED proxy | `signals.json` `undiscounted_blank_desc` |
| `binding_changed`, `diff_pct`, inflation signature | **Conditional** — recomputable at bind, not emitted | YELLOW | `signals.json` |
| `ocr_qty_eq_1`, `hybrid_h_qty_2_stable` | **No** — passc baseline / 10-run audit | RED | `signals.json` |

**Production path:** Pass B supplier → Pass D GPT qty → `parseMonetaryLineItems` → **`bindMonetaryColumns`** (correction target) → persist (`family-a-implementability-audit/REPORT.md` §Pipeline reference).

**Dependencies not in schema:** No `ocr_qty`, `discount_pct`, binding metadata, or stability fields in `invoice_items` (`signals.json` persistence_schema).

### Approach B — Extraction Source (Hybrid H)

| Dependency | Role | Evidence |
|------------|------|----------|
| `callOpenAiJson` + vision model | **Authoritative qty source** | `family-a-transition-trace/REPORT.md` §Code path |
| `TABLE_EXTRACTION_SYSTEM_PROMPT` | Column-faithful + pack-metadata rules (already present; insufficient for Mezzi/Ricotta) | `family-a-hybrid-diff-attribution/REPORT.md` |
| `TABLE_EXTRACTION_RESPONSE_FORMAT` strict `json_schema` | Removes legacy `unit_price`/`total` from GPT contract | `family-a-causal-attribution/REPORT.md` §Schema Review |
| OpenAI non-determinism | Mezzi/Ricotta 10/10 qty=2 stable wrong; post-fix behavior unknown | `family-a-fix-design/DESIGN.md` §Stability notes |
| Bad-path GPT raw JSON | **Missing** — cannot confirm GPT emits qty=2 vs binder inflation | `family-a-v25-raw-capture/artifact-index.json`; `family-a-transition-trace/REPORT.md` §Artifact gap |

**Verdict:** Approach A depends on in-pipeline structured fields at bind time (mostly available). Approach B depends on GPT behavior change + live invokes; no offline proof path without new GPT output.

---

## 3. Investigation-Only Signals Required

### Approach A — Binding (Option C)

| Gate | Investigation source | Runtime expressible? | Evidence |
|------|---------------------|---------------------|----------|
| `ocr_qty_eq_1` | passc-refinement reextract + RowSpec `meta.ocrQty` | **No** | `family-a-implementability-audit/REPORT.md` Task 4; 11/15 effective-paid rows `ocr_qty: null` |
| `hybrid_h_qty_2_stable` | 10/10 stability audit | **No** | Task 3; sensitivity: omit → Rolo run 7 FP |
| `undiscounted_blank_desc` | Visible DESC audit + RowSpec meta | **Partial** — `discount_pct` proxy | Task 5; `signals.json` RED |
| Documented combo (all 6) | Frozen artifacts only | **No — not in full** | Verdict **B** — `signals.json` |

**Implementability totals:** GREEN 3 · YELLOW 4 · RED 3 (`signals.json`).

**Runtime equivalence:** Documented rule 100% recall/precision; conservative proxy **92.3%** precision, **1 FP** (Rolo run 7) (`family-a-runtime-equivalence/REPORT.md` §Simulation results).

### Approach B — Extraction Source (Hybrid H)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Bad-path Hybrid H structured GPT raw | **Missing** | `family-a-v25-raw-capture/artifact-index.json`: `v25HybridHRawGptCapture: none` |
| Post-prompt 10× Bocconcino stability | **Not run** | `family-a-strategy-validation/REPORT.md` §Validation Evidence |
| Prompt-only sufficiency for undiscounted blank-DESC | **LOW (40%)** | `family-a-fix-design/DESIGN.md` §Confidence |
| Narrow scope avoids Mammafiore regression | **MEDIUM (55%)** — counterfactuals documented | `family-a-strategy-validation/REPORT.md` §Confidence |
| Prompt vs schema A/B isolation | **Not isolable** — deployed atomically | `family-a-causal-attribution/REPORT.md` §Timeline |

**Verdict:** Both approaches require investigation artifacts. Approach A needs 3 combo gates proxied or dropped; Approach B needs bad-path capture and live stability runs before selection (`family-a-strategy-validation/REPORT.md`: neither selectable today).

---

## 4. Blast Radius

### Scope of confirmed failure

| Metric | Value | Evidence |
|--------|-------|----------|
| Confirmed products | 2 (Mezzi, Ricotta) | `bug-pattern-expansion-audit/REPORT.md` Task 1 |
| Pattern expansion | **0** additional products | `bug-pattern-expansion-audit/REPORT.md` §Executive Summary |
| Invoice | 1 (`f0aa5a08`) | `family-a-impact-analysis/REPORT.md` |
| Sibling lines unchanged | 5 lines on same invoice | `family-a-impact-analysis/REPORT.md` §4 |

### Approach A — Binding (Option C)

| Scope | Blast radius | Key controls | Evidence |
|-------|-------------|--------------|----------|
| **Bocconcino-scoped + supplier gate** | LOW | Pomodori, Rolo stable, Acqua, Gorgonzola blocked | `family-a-fix-design/DESIGN.md` §Blast Radius; `family-a-option-c-replay/REPORT.md` |
| **Global rule (no supplier)** | HIGH — **12/15** effective-paid rows `would_fix` | Gorgonzola `diff_pct=34.25%` blocked only by gate stack | `family-a-option-c-replay/REPORT.md` L203; `family-a-strategy-validation/REPORT.md` |
| **Runtime proxy (stability omitted)** | MEDIUM — Rolo run 7 FP on **same invoice** as failures | 1/10 GPT variance path | `family-a-option-c-replay/sensitivity-result.json`; `family-a-sanity-review/REPORT.md` §1.2 |
| **Threshold drift** | Gorgonzola triggers if `diff_pct` threshold ≤0.30 | Combo-stress | `family-a-sanity-review/REPORT.md` §1.3 |

**Pipeline reach:** All invoices through monetary binding if rule is global (`family-a-fix-design/DESIGN.md` §Possible Correction Points C).

### Approach B — Extraction Source (Hybrid H)

| Scope | Blast radius | Key controls | Evidence |
|-------|-------------|--------------|----------|
| **Narrow Bocconcino undiscounted prompt** | LOW if scoped | Pomodori guardrail exists; Mezzi still fails today | `family-a-fix-design/DESIGN.md` §Option A |
| **Broad pack-notation prompt rules** | **MEDIUM–HIGH** | Mammafiore Aceto/Rulo qty 1→2 counterfactuals | `family-a-strategy-validation/REPORT.md` §Option A failure modes |
| **Schema-only change** | All Pass C outputs | Pomodori/Rolo qty=1 on same schema — insufficient alone | `family-a-causal-attribution/REPORT.md` §Schema Review |

**Pipeline reach:** ~every upload through Pass C table extraction (`family-a-fix-design/DESIGN.md` §Possible Correction Points A).

**Verdict:** Scoped Approach B has lower *theoretical* blast radius (supplier-template prompt). Scoped Approach A still touches all invoices through binding but with deterministic gates. Unscoped Approach A is higher risk (12/15 `would_fix`).

---

## 5. Validation Effort

### Approach A — Binding (Option C)

| Validation type | Status | Metrics | Evidence |
|-----------------|--------|---------|----------|
| Documented rule offline replay (15-row harness) | **Complete** | 100% recall, 100% precision, 0 FP | `family-a-option-c-replay/REPORT.md` §Metrics |
| Full population replay (15 effective-paid) | **Complete** | 15/15 verified | `family-a-full-population-replay/` (cited in `family-a-implementation-prep/`) |
| Runtime proxy integrated replay | **Complete** (runtime-equivalence audit) | 100% recall, **92.3%** precision, 1 FP | `family-a-runtime-equivalence/REPORT.md` |
| Exact rule shippable without investigation artifacts | **No** | Verdict C — not equivalent | `family-a-runtime-equivalence/REPORT.md` §Final verdict |
| Post-deploy 10× stability | **Pending** | Mandatory | `family-a-implementation-prep/readiness.json` |
| VL re-ingest end-to-end | **Pending** — class C fields | Ricotta €2.66→€5.31/kg, usable 3→1.5 kg | `family-a-impact-analysis/REPORT.md` §5 |
| Adversarial readiness | **NOT READY** | 3 blockers | `family-a-sanity-review/verdict.json` |

**Pre-implementation gates (read-only):** Replay exact runtime proxy on 15-row + effective-paid including Rolo run 7; confirm supplier threading; dry-run re-ingest (`family-a-sanity-review/REPORT.md` §Pre-implementation gates).

### Approach B — Extraction Source (Hybrid H)

| Validation type | Status | Evidence |
|-----------------|--------|----------|
| Root cause localization | **Complete** — Pass C qty=1 vs Hybrid H qty=2 | `family-a-transition-trace/REPORT.md` |
| Frozen extract proof of fix | **Not possible** — requires new GPT behavior | `family-a-strategy-validation/REPORT.md` §Provability comparison |
| Bad-path GPT raw capture | **Missing** | `family-a-v25-raw-capture/artifact-index.json` |
| Post-prompt 10× stability | **Not run** | `family-a-strategy-validation/REPORT.md` §Validation Evidence |
| Prompt counterfactual audit | **Complete** — documents regression surface | `passc-prompt-audit/` (cited in strategy-validation) |
| Selectable today | **NO** | `family-a-strategy-validation/REPORT.md` §Decision Readiness |

**Verdict:** Approach A has substantially lower validation effort for *offline* proof (frozen extracts suffice). Approach B requires live GPT invokes and stability runs; cannot be proven safe without new behavior.

---

## 6. Long-Term Maintainability

### Approach A — Binding (Option C)

| Factor | Assessment | Evidence |
|--------|------------|----------|
| Fixes root cause? | **No** — treats symptom; GPT may still emit qty=2 | `family-a-fix-design/DESIGN.md` Option C Cons; `family-a-sanity-review/REPORT.md` §1.6 |
| Dual correction layers | GPT wrong + binding correct → two places to reason about | `family-a-implementation-prep/REPORT.md` §Remaining Risks C |
| Determinism | HIGH — rule deterministic given extract input | `family-a-strategy-validation/REPORT.md` §Blast Radius Comparison |
| Rule drift risk | Gate stack fragile — partial implementation widens blast | `family-a-sanity-review/REPORT.md` §1.3 |
| Persisted data quality | Corrected qty at extraction + re-ingest still required for VL DB | `family-a-impact-analysis/REPORT.md` §5 |

### Approach B — Extraction Source (Hybrid H)

| Factor | Assessment | Evidence |
|--------|------------|----------|
| Fixes root cause? | **Yes** — qty authored at `callOpenAiJson`; aligns stored foundation | `family-a-transition-trace/REPORT.md` §First deviation |
| Single source of truth | One qty value from GPT through persist | `family-a-transition-trace/REPORT.md` §Hybrid H Mechanics |
| Determinism | LOW — GPT variance; Gorgonzola precedent for variance class | `family-a-strategy-validation/REPORT.md` §Option A failure modes #5 |
| Prompt maintenance | ~250-line prompt; interaction with schema not isolable | `family-a-causal-attribution/REPORT.md` |
| Anti-inflation rules present but insufficient | POMODORI guardrail works; Mezzi/Ricotta undiscounted blank-DESC not covered | `family-a-fix-design/DESIGN.md` §Candidate Separating Signals |

**Verdict:** Approach B is more maintainable as a *data foundation* fix (single authoritative qty). Approach A adds permanent binding-layer patch logic with documented non-equivalence to validated rule.

---

## Cross-Cutting Evidence

### Root cause localization (shared)

| Claim | Confidence | Evidence |
|-------|------------|----------|
| Failure at Hybrid H table GPT pass (stage 4) | 91% | `family-a-transition-trace/`, `ricotta-root-cause-trace/`, `mezzi-root-cause-trace/` |
| Downstream qty-invariant | 97% | `family-a-transition-trace/REPORT.md` §Code path |
| Scope: 2 products, 0 expansion | 90% | `bug-pattern-expansion-audit/REPORT.md` |
| Causal mechanism: prompt+schema interaction | 45% (interaction primary) | `family-a-causal-attribution/REPORT.md` |

### Conflicting prior verdicts (evidence-only note)

| Artifact | Verdict | Conflicted by |
|----------|---------|---------------|
| `family-a-implementation-prep/REPORT.md` | READY FOR IMPLEMENTATION (Option C) | `family-a-sanity-review/verdict.json` NOT READY |
| `implementation-priority-audit/REPORT.md` | Family A Readiness A | `family-a-runtime-equivalence/REPORT.md` — runtime not equivalent |

---

## Structured Comparison Tables

### Table 1 — Dimension scores (1= worse / harder, 5= better / easier for delivery)

| Dimension | A — Binding | B — Extraction | Notes |
|-----------|:-----------:|:--------------:|-------|
| Complexity (lower is better) | 3 | 2 | A: proxy mapping; B: interaction + GPT variance |
| Runtime self-sufficiency | 3 | 2 | A: most signals at bind; B: requires live GPT |
| Investigation artifact dependence | 2 | 2 | Both blocked without additional work |
| Blast radius (scoped) | 3 | 4 | B: template-scoped prompt lower if narrow |
| Offline provability | 5 | 1 | A: 100% replay; B: cannot prove without new GPT |
| Foundation alignment | 2 | 5 | B: fixes qty at authoring stage |
| **Delivery readiness (investigations only)** | **3** | **1** | Sanity review NOT READY for A; strategy-validation NO for both |

### Table 2 — Investigation-only signals by approach

| Signal / requirement | Required for A? | Required for B? |
|---------------------|:---------------:|:---------------:|
| passc OCR baseline (`ocr_qty_eq_1`) | Yes (documented combo) | No (implicit in good-path reference) |
| 10-run stability (`hybrid_h_qty_2_stable`) | Yes (blocks Rolo run 7 FP) | Informative only |
| Visible DESC audit (`undiscounted_blank_desc`) | Yes (as replayed) | Informs prompt scoping |
| Bad-path Hybrid H GPT raw JSON | No (symptom fix) | **Yes — blocker** |
| Post-fix 10× stability | Post-deploy (both) | Pre-selection (B) |
| passc-prompt-audit counterfactuals | No | Yes (regression risk) |

### Table 3 — Validation artifacts completeness

| Artifact | Supports A | Supports B |
|----------|:----------:|:----------:|
| `family-a-option-c-replay/` (100% documented rule) | ✅ | — |
| `family-a-runtime-equivalence/` (proxy divergence) | ✅ | — |
| `family-a-hybrid-diff-attribution/` | — | ✅ |
| `family-a-causal-attribution/` | — | ✅ |
| `family-a-transition-trace/` | ✅ (symptom location) | ✅ (correction target) |
| `family-a-strategy-validation/` | ✅ | ✅ |
| `bug-pattern-expansion-audit/` | ✅ | ✅ |
| `family-a-impact-analysis/` | ✅ | ✅ |

---

## Final Recommendation — "Fix the Data Foundation First"

### Principle alignment

**Approach B (Extraction Source / Hybrid H) better matches the Marginly principle "Fix the data foundation first."**

| Criterion | Why B aligns | Evidence |
|-----------|--------------|----------|
| **Where quantity is authored** | GPT table pass (`callOpenAiJson`) is the authoritative qty source; binding explicitly preserves quantity | `family-a-transition-trace/REPORT.md` §Quantity Mutation Locations; `invoice-monetary-binding.ts` cited in implementability audit |
| **First incorrect value** | qty 1→2 appears between Pass C baseline and Hybrid H output, not at binding | `family-a-transition-trace/REPORT.md` §Family A Differential |
| **Downstream is not the foundation** | `applyEffectivePaidPrice` halves unit_price but never assigns quantity — binding cannot be the data foundation | `family-a-fix-design/DESIGN.md` §Pipeline fact |
| **Impact analysis counterfactual** | Correct state defined as "Extraction quantity 2→1 at **Hybrid H source**" | `family-a-impact-analysis/REPORT.md` header |
| **Approach A explicit limitation** | Option C "treats symptom not GPT cause" | `family-a-fix-design/DESIGN.md` Option C Cons |

### Investigation caveat (evidence-only; not a fix design)

Approach B is **stronger on principle alignment** but **weaker on investigation closure**:

- Neither approach is selectable today (`family-a-strategy-validation/REPORT.md` §Decision Readiness).
- Approach B cannot be proven offline; bad-path GPT raw missing; prompt-only sufficiency assessed **LOW (40%)** (`family-a-fix-design/DESIGN.md`).
- Approach A has 100% offline replay on the **documented** rule but runtime-equivalence verdict **C — not equivalent**; sanity review **NOT READY** (`family-a-runtime-equivalence/`, `family-a-sanity-review/`).

### Synthesis verdict

| Question | Answer |
|----------|--------|
| Which approach matches "Fix the data foundation first"? | **Approach B — Extraction Source (Hybrid H / prompt/schema)** |
| Which approach has stronger investigation provability today? | **Approach A — Binding (Option C)** — offline replay path exists |
| Are investigations sufficient to implement either without further read-only gates? | **No** — A needs runtime proxy replay + Rolo run 7 resolution; B needs bad-path capture + post-prompt stability |

**Evidence-backed hierarchy (investigations only):**

1. **Principle:** Fix at extraction source (Approach B) — qty foundation is GPT output, proven at stage 4.
2. **Provability:** Approach A has completed offline validation of a documented binding rule; shipping requires a **different** runtime proxy rule (`family-a-runtime-equivalence/REPORT.md`).
3. **Priority audit context:** Family A ranked #1 for implementation readiness among bug families on Approach A evidence (`implementation-priority-audit/REPORT.md`) — this reflects delivery readiness, not foundation principle alignment.

---

## Evidence Index

| Artifact | Role in comparison |
|----------|-------------------|
| `.tmp/family-a-fix-design/DESIGN.md` | Options A/C definitions, blast radius, confidence |
| `.tmp/family-a-strategy-validation/REPORT.md` | A vs C validation, selectability, provability |
| `.tmp/family-a-implementation-prep/REPORT.md` | Pipeline trace, change surface, runtime proxies |
| `.tmp/family-a-implementability-audit/` | Signal inventory, verdict B |
| `.tmp/family-a-sanity-review/` | NOT READY adversarial review |
| `.tmp/family-a-runtime-equivalence/` | Proxy vs documented rule divergence |
| `.tmp/family-a-transition-trace/` | Pass C → Hybrid H boundary, stage 4 root |
| `.tmp/family-a-hybrid-diff-attribution/` | Prompt/crop/schema diff |
| `.tmp/family-a-causal-attribution/` | Interaction model 45% |
| `.tmp/family-a-option-c-replay/` | 100% documented rule replay |
| `.tmp/family-a-impact-analysis/` | Downstream field matrix |
| `.tmp/bug-pattern-expansion-audit/` | 0 expansion, scope 2 |
| `.tmp/implementation-priority-audit/` | Relative priority Readiness A |

**No code changes. No DB writes. No deployments. No fixes designed.**
