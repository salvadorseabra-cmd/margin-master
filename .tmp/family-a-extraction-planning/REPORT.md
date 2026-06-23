# Family A — Extraction-Layer Remediation Planning

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Scope:** Extraction layer only. NOT Option C binding. NOT fix design. NO code/DB/deploy changes.

**Accepted root cause:** PDF/OCR/Pass C qty=1 → Hybrid H qty=2 (10/10 stable). First error at Hybrid H table GPT pass. Only Ricotta + Mezzi confirmed (invoice `f0aa5a08`, IL BOCCONCINO).

**Question answered:** How should Family A be approached if we correct at the extraction source?

---

## Executive Summary

Family A quantity inflation is **proven at Hybrid H `callOpenAiJson`** — the table GPT pass in `invoice-table-extraction.ts`. All deterministic post-GPT stages preserve qty=2. The Pass C → Hybrid H transition introduced prompt (~125→~250 lines), schema (legacy → strict structured monetary), and user-message changes; crop geometry (5→7 rows) is **eliminated** as primary cause by the passc-refinement 7-row control (qty=1).

Causal attribution favors **prompt+schema interaction (45%)** over either alone. Existing Hybrid H anti-inflation rules (PACK METADATA, POMODORI negative, FRACTIONAL) are present yet Mezzi/Ricotta still emit qty=2 on undiscounted blank-DESC rows where structured monetary fields return all-null.

**Strategic direction:** Correct at extraction source (data foundation). **Implementation readiness:** **Verdict B — plan-first** — correct locus proven, but bad-path GPT raw missing, post-fix stability not run, and prompt-only sufficiency assessed LOW (40%). Pre-implementation gates must close before any fix design.

Option C binding has stronger offline provability but is **out of scope**; runtime-equivalence audit verdict **C (not equivalent)** and sanity review **NOT READY** reinforce extraction-first priority without selecting binding.

---

## 1. Extraction Ownership Chain

| Stage | Module | Produces Qty? | Modifies Qty? | Family A Status |
|-------|--------|:-------------:|:-------------:|-----------------|
| 0 — PDF / geometry audit | `.tmp/geometry-audit/images/f0aa5a08-….png` | No | No | **Ground truth** — QUANT=1,000 |
| 1 — Pass A date | `invoice-date-extraction.ts` | No | No | Out of scope |
| 2 — Pass B supplier | `invoice-metadata-extraction.ts` | No | No | Not fed to table GPT |
| 3 — Pass C footer | `invoice-footer-metadata-extraction.ts` | No | No | `knownTotal` for empty-table retry only |
| 4 — Table crop | `invoice-image-crop.ts` → `cropTableRegionForLineItems` | No | No | **Eliminated** — 7-row passc control qty=1 |
| **5 — Hybrid H table GPT** | `invoice-table-extraction.ts` → `callOpenAiJson` | **Yes** | **Yes** | **PROVEN mutation site** — qty 1→2 |
| 6 — parseMonetaryLineItems | `invoice-monetary-binding.ts` L25–44 | No | No | Preserves qty=2 |
| 7 — bindMonetaryColumns | `invoice-monetary-binding.ts` L214–217 | No | No | Preserves qty=2; halves unit_price |
| 8 — reconcileLineItemAmounts | `invoice-line-reconcile.ts` L68–85 | No | No | Preserves (both price fields present) |
| 9 — finalizeExtractedLineItems | `reconcileLineItemsToNetSubtotal` | No | No | Preserves (requires qty=1) |
| 10 — Client normalize | `invoices.tsx` | No | No | Name cleanup only |
| 11 — Persistence | `invoice_items` INSERT | No | No | Stores qty=2 |

**Pipeline order inside `runTableExtractionPass`:**

```
cropTableRegionForLineItems
  → callOpenAiJson (TABLE_EXTRACTION_SYSTEM_PROMPT + TABLE_EXTRACTION_RESPONSE_FORMAT)
  → parseMonetaryLineItems
  → bindMonetaryColumns
  → reconcileLineItemAmounts
```

Then `index.ts`: `finalizeExtractedLineItems` → client handoff.

**Ownership conclusion:** Quantity is **authored once** at stage 5. Extraction-layer remediation must target stage 5 or an immediate post-GPT gate before stage 7 — not binding (Option C), not reconcile, not persistence.

---

## 2. Hybrid H Change Surface

From `family-a-hybrid-diff-attribution`, `family-a-input-diff`, `family-a-causal-attribution`, `family-a-v25-raw-capture`.

### Prompt (`TABLE_EXTRACTION_SYSTEM_PROMPT`, L18–255)

| Dimension | Pass C era | Hybrid H era |
|-----------|------------|--------------|
| Length | ~125 lines (`passc-prompt-audit/passc-prompt.txt`) | ~250 lines |
| User message | Extract **all** line items | Copy qty/gross/discount/net from **labeled columns** |
| Infer qty from description | **Allowed** (`DO infer when clearly present`) | **Removed** — column-only |
| Pack notation | Pack 24 → qty 24 examples | PACK NOTATION IS METADATA (L65–67) |
| CX+*N negatives | None | POMODORI `(CX 2,5KG*6)` → qty 1 NOT 6 (L131–135) |
| Fractional | Absent in passc snapshot | Copy 1,5 / 0,5 exactly (L118–125) |
| Monetary contract in prompt | unit_price + total | gross_unit_price + discount_pct + line_total_net |

**Attribution rank:** 1st (82% confidence). **Contradiction:** Pass C refinement (`04c0d88`) already had column-faithful + pack-metadata core and produced qty=1 on 7-row Bocconcino reextract.

### Schema (`TABLE_EXTRACTION_RESPONSE_FORMAT`, L257–293)

| Field | Pass C | Hybrid H (v23+) |
|-------|--------|-----------------|
| `quantity` | number \| null | unchanged type |
| `unit_price` / `total` | in GPT contract | **removed** (strict `json_schema`) |
| `gross_unit_price`, `discount_pct`, `line_total_net` | absent | **required** (nullable) |

**Family A bad-path API output:** Ricotta and Mezzi return `gross_unit_price: null`, `discount_pct: null`, `line_total_net: null` — same as Pomodori/Rolo controls that read qty=1 correctly.

**Attribution rank:** 2nd (68% confidence). Deployed atomically with prompt; not isolable without version-staged captures.

### GPT call envelope

| Parameter | Value |
|-----------|-------|
| Model | gpt-4.1 (unchanged) |
| Temperature / seed | 0 / 42 |
| Location | `callOpenAiJson` L383–399 |
| Raw capture | **MISSING** — `artifact-index.json`: `v25HybridHRawGptCapture: none` |

### Crop geometry

| Era | Rows visible | Mezzi neighbours |
|-----|--------------|------------------|
| Pass C DB-ingest (5-row) | 5/7 — Mozzarella/Stracciatella excluded | First complete row |
| Hybrid H (7-row, post `2edcd02`) | 7/7 | Below Mozzarella qty=10, Stracciatella qty=24 |

**Isolation control:** `passc-refinement-validation/reextract/f0aa5a08-….json` (2026-06-11, 7 rows): Mezzi qty=1, Ricotta qty=1. `final-validation-lab-rerun/extracts/…` (v25, same geometry): both qty=2.

**Attribution rank:** 3rd — **eliminated as primary** (92% confidence).

### Pipeline (post-GPT)

No merge, scoring, candidate selection, or qty synthesis in code. Production replay confirms qty-invariant through bind → reconcile → finalize (97% confidence).

---

## 3. Evidence Strength — Hypothesis Table

| Hypothesis | Supports qty=2? | Key contradicting evidence | Strength | Confidence |
|------------|:---------------:|----------------------------|----------|------------|
| **Crop 5→7 rows** | Partial (era correlates) | 7-row passc control qty=1; Pomodori/Rolo/Acqua correct on same crop | WEAK | 22% |
| **Prompt delta** | Yes | Anti-inflation rules outnumber pro-inflation; Pass C refinement qty=1; explicit negatives fail on Mezzi/Ricotta | MODERATE | 82% (30% causal share) |
| **Schema delta** | Possible | Pomodori/Rolo same schema qty=1; v23 before v25 without captured Family A | MODERATE | 68% (25% causal share) |
| **Prompt+schema interaction** | Yes | Rolo shares bad-path null structured profile, qty=1; undiscounted blank-DESC + pack/weight tokens distinguish Family A | **STRONG** | 74% (45% causal share) |
| **Downstream binding** | No | Code never assigns quantity; replay invariant | ELIMINATED | 97% |
| **Binding Option C** | N/A (out of scope) | Symptom patch; runtime not equivalent to validated rule | NOT EXTRACTION | — |

**Mechanism hypothesis (evidence-only):** On undiscounted IL BOCCONCINO rows with blank DESC, strict structured schema yields all-null monetary fields; GPT adjusts `quantity` (possibly via `qty>1 → line_total_net > gross_unit_price` heuristic or description token conflation with `1,5KG` / `*6`) despite column-faithful instructions. Rolo lacks distinguishing pack/weight tokens.

---

## 4. Strategy Families (Extraction Layer)

Planning dimensions only — **no fix design**.

### Family A — Prompt refinement

| Dimension | Assessment |
|-----------|------------|
| **Locus** | `TABLE_EXTRACTION_SYSTEM_PROMPT` + user message in `callOpenAiJson` |
| **Complexity** | **HIGH** — ~250-line prompt; interaction with schema; narrow Bocconcino scoping vs broad pack rules tension |
| **Observability** | **LOW** — requires live GPT invokes; bad-path raw missing; non-deterministic |
| **Validation burden** | **HIGH** — 10× Bocconcino stability mandatory; 15-row + 6-invoice regression; passc-prompt-audit counterfactuals for Mammafiore |
| **Blast radius** | LOW if Bocconcino undiscounted template-scoped; MEDIUM–HIGH if pack rules broaden |
| **Sufficiency today** | **LOW (40%)** — existing guardrails insufficient for Mezzi/Ricotta |
| **Selectable** | **NO** |

### Family B — Schema / response contract

| Dimension | Assessment |
|-----------|------------|
| **Locus** | `TABLE_EXTRACTION_RESPONSE_FORMAT` strict `json_schema` |
| **Complexity** | **HIGH** — global contract change; monetary field semantics affect all rows |
| **Observability** | **LOW** — not isolable from prompt deploy; v21–v23 Ricotta/Mezzi not captured |
| **Validation burden** | **HIGH** — full VL re-extract; version-staged A/B needed |
| **Blast radius** | MEDIUM — all table GPT outputs |
| **Sufficiency alone** | **NO** — Pomodori/Rolo correct on identical schema |
| **Selectable** | **NO** |

### Family C — Extraction validation (post-GPT, pre-bind)

| Dimension | Assessment |
|-----------|------------|
| **Locus** | New gate between `parseMonetaryLineItems` and `bindMonetaryColumns` in `runTableExtractionPass` |
| **Complexity** | **MEDIUM** — deterministic if rules defined; no column OCR fallback today |
| **Observability** | **MEDIUM** — in-process on GPT JSON; testable on frozen output **if captured** |
| **Validation burden** | **MEDIUM–HIGH** — replay on GPT output; Rolo run-7 and Gorgonzola variance class risks if heuristics too broad |
| **Blast radius** | MEDIUM if global; LOW if Bocconcino-scoped with supplier threading |
| **Note** | Extraction-layer placement — **distinct from Option C binding correction** (out of scope) |
| **Selectable** | **NO** — heuristics undefined; bad-path raw missing |

### Family D — Other extraction levers

| Lever | Status | Complexity | Validation |
|-------|--------|------------|------------|
| Crop geometry revert | **Eliminated** | LOW | 7-row control disproves |
| Model / temperature change | Not investigated | HIGH | Full VL regression |
| Supplier threading Pass B → table GPT | Not present today | LOW–MEDIUM | Enables template-scoped prompt only |
| Empty-table full-image retry | Unrelated to Family A | LOW | N/A |
| Raw GPT logging / capture | **Missing artifact** | LOW | Prerequisite for all families |

**Strategic implication:** Interaction-primary cause (45%) implies **joint prompt+schema validation** in planning — single-lever Family A or B alone is evidence-incomplete. Family C is a fallback extraction-layer gate if GPT behavior cannot be steered reliably.

---

## 5. Validation Requirements Matrix

### Primary failures

| Product | Must correct | Pre-fix evidence | Post-fix gates |
|---------|--------------|------------------|----------------|
| **Ricotta 1,5KG** | qty 2→1; bound unit 3.99→7.967; usable 3→1.5 kg; op €2.66→€5.31/kg | 10/10 qty=2; passc qty=1; cluster `decimal_weight_1,5KG` | 10× qty=1; phase1 forensics; VL re-ingest class C |
| **Mezzi (CX 1KG*6)** | qty 2→1; bound unit 13.65→27.30; Last Purchase 2→1 un | 10/10 qty=2; split-brain UI; cluster `CX+*N` | 10× qty=1; usable/op €/kg stay €4.55/kg; mismatch cleared |

### In-invoice controls (invoice `f0aa5a08`)

| Product | Role | Must preserve | Risk if extraction change too broad |
|---------|------|---------------|-------------------------------------|
| **Pomodori (CX 2,5KG*6)** | Discounted CX+*N control | qty=1; DESC 20% context | LOW — existing negative example |
| **Rolo 1KG** | Hardest negative | qty=1 (9/10 stable; run 7 transient qty=2) | LOW–MEDIUM prompt; MEDIUM validation heuristics |
| **Acqua (CX 75CL*15)** | True multi-qty | qty=2 (PDF QUANT=2,000) | LOW |
| **Mozzarella / Stracciatella** | High-qty discounted neighbours | qty=10 / qty=24 | LOW for Mezzi neighbour hypothesis (eliminated) |

### Cross-invoice control

| Product | Role | Must preserve | Risk |
|---------|------|---------------|------|
| **Gorgonzola** (Mammafiore/Emporio) | GPT variance class | Not treated as Family A; qty may vary 6/10 at qty=2 | LOW prompt; MEDIUM–HIGH global extraction-validation |

### Full invoice + corpus

| Scope | Requirement |
|-------|-------------|
| **Full VL invoice f0aa5a08** | 2 lines corrected; 5 siblings unchanged; header total €290.64 unchanged |
| **15-row candidate corpus** | 13/15 remain qty=1; 0 expansion beyond Mezzi/Ricotta |
| **6-invoice VL corpus** | No regression on Bidfood, Aviludo, Mammafiore, Emporio controls |
| **Post-deploy** | Dry-run re-ingest: `ingredient_price_history`, `purchase_quantity`, Ricotta usable 1.5 kg (impact analysis class C) |

---

## 6. Readiness Assessment

### A — Proven (do not re-litigate)

| Item | Confidence | Source |
|------|------------|--------|
| First error at Hybrid H table GPT pass | 91% | transition-trace, ricotta/mezzi traces |
| Downstream qty-invariant | 97% | transition-trace, runtime-equivalence |
| Scope: 2 products, 1 invoice, 0 expansion | 90% | scope-audit, bug-pattern-expansion |
| Pass C qty=1 (5-row + 7-row + gpt-raw) | 97% | passc-refinement-validation, input-diff |
| Hybrid H qty=2 stable 10/10 | 97% | final-stability-audit |
| Crop eliminated | 92% | hybrid-diff-attribution |
| Extraction-source = data foundation fix locus | 85% | strategy-comparison |
| Option C binding not runtime-equivalent | 88% | runtime-equivalence, sanity-review |

### B — Missing but useful (pre-implementation)

| Item | Why needed |
|------|------------|
| Bad-path Hybrid H structured GPT raw JSON | Confirm GPT emits qty=2 at emission |
| Post-prompt/schema 10× Bocconcino stability | Close primary validation gate |
| Prompt vs schema A/B isolation | Target minimal change surface |
| v21–v23 Ricotta/Mezzi captures | Pinpoint regression introduction |
| passc-prompt-audit counterfactual re-run | Mammafiore *2 regression surface |
| Dry-run VL re-ingest f0aa5a08 | Class C downstream propagation |
| Rolo run-7 monitoring | Same-invoice GPT variance boundary |

### C — Blocking (prevents implementation selection)

| Blocker | Impact |
|---------|--------|
| Bad-path GPT raw absent | Cannot confirm emission-level failure |
| Prompt-only sufficiency LOW (40%) | Prompt edit alone unproven |
| Prompt vs schema not isolable | Cannot plan minimal diff |
| No post-fix stability evidence | Cannot close validation matrix |
| Interaction primary (45%) | Single-lever strategies evidence-incomplete |
| strategy-validation: neither selectable | Decision gates not met |

---

## 7. Final Verdict

### **B — Plan-first**

**Correct strategic locus:** Extraction source (Hybrid H `callOpenAiJson`) is where quantity is authored and where Family A must be corrected for data-foundation alignment (`family-a-strategy-comparison`: "Fix the data foundation first" → Approach B extraction source).

**Not ready to implement:** Blocking items in section 6C prevent fix design or deploy. Prompt-only, schema-only, and extraction-validation families all require bad-path capture and post-change stability runs before selection.

**Not deferred (not C):** Root cause localization, scope closure, and crop/binding elimination are proven. Option C binding has offline replay but is excluded from this plan; runtime-equivalence and sanity review confirm binding is the wrong foundation layer even though it has better offline provability today.

### Recommended pre-implementation sequence (planning only)

1. **Capture** bad-path Hybrid H structured GPT raw (`capture-hybrid-h.deno.ts` — script exists, not run).
2. **Characterize** structured-null bad-path at emission vs Rolo control on same invoice.
3. **Plan joint prompt+schema validation** — interaction model (45%) requires coupled assessment, not single-lever edits.
4. **Run scoped counterfactual audit** against Mammafiore Aceto/Rulo before any prompt broadening.
5. **Execute 10× Bocconcino re-extract** after candidate extraction change (mandatory for Ricotta + Mezzi + full invoice gate).
6. **Run validation matrix:** Ricotta, Mezzi, Pomodori, Rolo, Acqua, Gorgonzola, f0aa5a08, 15-row corpus.
7. **Dry-run VL re-ingest** for downstream class C fields before persist.

### Why not Option C (context only)

| Factor | Extraction source | Option C binding |
|--------|-------------------|----------------|
| Foundation alignment | **Yes** — fixes qty at author | No — symptom patch |
| Offline provability today | No — requires new GPT behavior | Yes — 100% documented rule replay |
| Runtime shippability | N/A until gates close | **Not equivalent** — 3/6 gates investigation-only |
| Sanity review | N/A (extraction not attempted) | **NOT READY** |

Extraction-first is the **strategic** choice; binding Option C is the **tactical** choice with better frozen-artifact proof but proven non-equivalence at runtime.

---

## Confidence Summary

| Claim | Confidence |
|-------|------------|
| Root cause at Hybrid H table GPT pass | **91%** |
| Downstream does not modify quantity | **97%** |
| Scope localized to Ricotta + Mezzi | **90%** |
| Interaction primary (prompt+schema) | **74%** |
| Extraction-source is correct fix locus | **85%** |
| Ready to implement extraction fix today | **25%** |
| **Overall planning confidence** | **78%** |

---

## Artifact Index

| Artifact | Role |
|----------|------|
| `.tmp/family-a-extraction-planning/planning.json` | Machine-readable planning data |
| `.tmp/family-a-transition-trace/` | Pass C → Hybrid H boundary, qty mutation proof |
| `.tmp/family-a-input-diff/` | GPT-call envelope field diff |
| `.tmp/family-a-hybrid-diff-attribution/` | Prompt/crop/schema attribution ranking |
| `.tmp/family-a-causal-attribution/` | Prompt vs schema vs interaction probabilities |
| `.tmp/family-a-strategy-comparison/` | Extraction vs binding strategic comparison |
| `.tmp/family-a-strategy-validation/` | Selectability gates, validation evidence |
| `.tmp/family-a-fix-design/DESIGN.md` | Correction point options (A/B/C/D) — extraction options A/B referenced |
| `.tmp/family-a-v25-raw-capture/` | Bad-path raw gap documentation |
| `.tmp/passc-refinement-validation/` | 7-row passc control qty=1 |
| `.tmp/ricotta-root-cause-trace/` | End-to-end Ricotta; stage 4 first error |
| `.tmp/mezzi-root-cause-trace/` | End-to-end Mezzi; split-brain mechanism |
| `.tmp/bug-pattern-expansion-audit/` | 0 expansion confirmation |
| `.tmp/family-a-scope-audit/` | 15-candidate population, minimum separating combo |
| `.tmp/family-a-runtime-equivalence/` | Why not Option C at runtime |
| `.tmp/family-a-sanity-review/` | Adversarial NOT READY (binding context) |
| `.tmp/family-a-impact-analysis/` | Downstream validation requirements |

**No code changes. No DB writes. No deployments. No fixes designed.**
