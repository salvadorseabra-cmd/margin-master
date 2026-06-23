# Family A — Strict Read-Only Implementation Sanity Review

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes  
**Posture:** Adversarial — challenge readiness assuming implementation tomorrow

---

## Verdict

**NOT READY**

---

## 1. What could still go wrong?

### 1.1 The rule to be shipped is not the rule that was replay-validated

The offline harness that achieved **100% recall / 0 FP** (`.tmp/family-a-option-c-replay/`, `.tmp/family-a-full-population-replay/`) evaluates a **documented 6-signal combo AND** `qty_inflation_signature`, including three signals that **do not exist at runtime**:

| Replay gate | Runtime status | Evidence |
|-------------|----------------|----------|
| `ocr_qty_eq_1` | **Not available** — requires frozen Pass C baseline | `.tmp/family-a-implementability-audit/REPORT.md` Task 4; `signals.json` verdict **RED** |
| `hybrid_h_qty_2_stable` | **Not available** — requires 10-run stability audit | implementability audit Task 3; grep finds zero production stability logic |
| `undiscounted_blank_desc` | **Investigation meta** — replay uses hand-authored RowSpec, not DESC column | implementability audit Task 5; `replay.mts` L132–333 |

Implementation prep proposes **different proxies** (inflation signature, `discount_pct`, supplier gate, drop stability) at **75% confidence** (`.tmp/family-a-implementation-prep/REPORT.md` L294). **No artifact replays that integrated runtime proxy package end-to-end.** Tomorrow's code would be a new rule, not the validated one.

### 1.2 Stability gate omission creates a documented false-positive vector

Sensitivity ablation on the frozen 15-row set (`.tmp/family-a-option-c-replay/sensitivity-result.json`):

- `omit_hybrid_h_qty_2_stable` → **1 false positive**: Rolo transient run 7 (qty 1→2, inflation signature ~50%, all other combo signals true)
- Option C replay REPORT L164: *"Rolo run 7 **would false-positive** if stability gate omitted"*

Implementation prep explicitly recommends **dropping the stability gate** because it is not observable at single-run runtime (`.tmp/family-a-implementation-prep/REPORT.md` L107–108, L278–282). The proposed mitigation (conservative combo) is **design intent only** — not replay-proven to block Rolo run 7 while still correcting Mezzi/Ricotta.

Rolo is on the **same invoice** (`f0aa5a08`) as the two failures. A 1/10 GPT variance path that matches the inflation profile is a live regression risk on the very invoice being fixed.

### 1.3 Gate stack is fragile — combo-stress shows narrow margins

`.tmp/family-a-option-c-replay/combo-stress-result.json`:

- **Gorgonzola (effective-paid DB row)**: baseline `wouldTrigger=false`; if blocking gates are removed, `wouldTrigger=true` with `qty_inflation_signature=true`
- **Gorgonzola counterfactual** with Bocconcino supplier + stability + undiscounted: dropping `unit_price_approx_total_at_qty1` AND `diff_pct≥45%` → **trigger=true**
- Threshold sweep: at `diff_pct` threshold ≤0.30, Gorgonzola effective-paid row (`diff_pct=0.3425`) would pass inflation gate

Family A failures sit at `diff_pct≈0.50`. Gorgonzola sits at **0.3425** — blocked today by multiple gates, but a partial proxy implementation (e.g., missing supplier threading, wrong `discount_pct` read, threshold drift) could widen the blast radius. Effective-paid population audit: **12/15 rows** have `would_fix=true` under binding without supplier scope (`.tmp/family-a-option-c-replay/REPORT.md` L203; full-population REPORT L246).

### 1.4 Extraction fix does not automatically repair VL persisted state

Impact analysis marks downstream correction paths as **C — Requires validation** (`.tmp/family-a-impact-analysis/REPORT.md` §5):

- Re-ingest vs manual row edit divergence on `ingredient_price_history`
- `ingredients.purchase_quantity` persist path (catalog stores invoice qty=2 today)
- Pre-bind gross `unit_price` (7.97 / 27.31) vs bound display (3.99 / 13.65) — DB currently stores pre-bind values with qty=2, creating `2×7.97≠7.97` inconsistency (ricotta/mezzi traces stage 7)

Ricotta root-cause trace confirms persistence keeps **pre-bind unit_price**, not bound unit. Correcting qty at extraction + re-ingest must rewrite catalog, price history, usable stock (Ricotta 3 kg→1.5 kg), and mismatch alerts — **none of this is replay-validated offline**. Implementation prep lists VL re-ingest as **pending post-deploy** (readiness.json L259).

### 1.5 Ricotta correction shifts operational economics — intentional but unvalidated downstream

Impact analysis: Ricotta operational cost **€2.66/kg → €5.31/kg**, usable **3 kg → 1.5 kg** (15 fields class **A** must change). No recipes reference Ricotta today (impact analysis §1 dashboard), but any future recipe or margin alert would inherit the shift. Mezzi op €/kg unchanged; split-brain UI fix depends on re-ingest propagating qty=1 to Last Purchase while usable stays 6 kg.

### 1.6 GPT-layer root cause remains inferential

Bad-path Hybrid H structured GPT raw JSON is **missing** (`.tmp/family-a-implementation-prep/REPORT.md` L249; artifact-index: `v25HybridHRawGptCapture: none`). First incorrect value at stage 4 is established by Pass C vs Hybrid H diff (ricotta/mezzi traces, 10/10 stability), but **Option C does not fix GPT** — it patches binding. If GPT starts emitting qty=3 or qty=2 on previously correct rows, the binding gate may not generalize. Prompt vs schema causality unproven (`.tmp/family-a-causal-attribution/` cited in implementation prep).

### 1.7 Supplier may not reach binding without unvalidated wiring

Option C supplier gate requires `supplier_il_bocconcino`. Pass B supplier is available on the invoice response, but **binding today does not receive supplier** (`invoice-table-extraction.ts` L401 calls `bindMonetaryColumns` without supplier context). Implementation prep lists threading supplier through `index.ts` as **conditional** (readiness.json L65–66, L265). Omitting supplier gate while keeping inflation signature → sensitivity shows `omit_supplier_il_bocconcino` is safe on frozen 15-row extract set, but effective-paid full population relies on supplier blocking for Gorgonzola and 11 Bidfood rows.

---

## 2. What assumptions remain unproven?

| # | Assumption | Status | Evidence |
|---|------------|--------|----------|
| A1 | **Runtime proxy rule ≡ documented Option C replay rule** | **Unproven** (75% est.) | implementability audit verdict **B**; no integrated proxy replay artifact |
| A2 | **`discount_pct == null \|\| 0` proxies `undiscounted_blank_desc`** | **Unproven** | Replay uses investigation RowSpec; Pomodori has `discount_pct=20` and `undiscounted=false` — proxy untested on full 15 effective-paid population with runtime fields only |
| A3 | **Inflation signature (`hasInconsistentGrossLineTotal` + `diff_pct≥45%`) proxies `ocr_qty_eq_1`** | **Partially supported** | Sensitivity: `omit_ocr_qty_eq_1` → 0 FP on frozen extract set; but binding signals are **recomputed offline**, not emitted at runtime (implementability audit YELLOW cluster) |
| A4 | **Dropping stability gate is safe on Bocconcino invoice** | **Disproven on frozen data** | Rolo run 7 triggers under looser rule; 1/10 transient qty=2 documented |
| A5 | **Scope closed at 2 products / 0 expansion** | **Supported (90%)** | `.tmp/bug-pattern-expansion-audit/`: 0 additional Family A hits; 15/15 scope audit |
| A6 | **Full-population replay validates production safety** | **Overstated** | Full-population replay **inherits investigation metadata** for 11/15 rows with `ocr_qty: null` treated as false (full-population REPORT L651, L253: OCR proxy confidence **55%**) |
| A7 | **Re-ingest propagates corrected qty through ingredients, history, alerts** | **Unproven** | Impact analysis §5 class **C**; test plan phases 2–6 are post-deploy only |
| A8 | **Pre-bind unit_price persistence aligns after qty=1 correction** | **Unproven** | Ricotta/mezzi traces show pre-bind/post-bind split today; impact analysis flags gross vs bound as **C** |
| A9 | **10× post-fix Bocconcino stability will hold Mezzi/Ricotta at qty=1** | **Unproven** | Mandatory but pending; current failure is 10/10 stable at qty=**2** — fix targets binding, not GPT variance |
| A10 | **Root cause is Hybrid H GPT qty inflation, not downstream** | **Proven (91%)** | ricotta/mezzi traces: first error stage 4; reconcile/bind/persist qty-invariant |

---

## 3. Is there any remaining reason NOT to implement Family A now?

**Yes — three blockers remain for a tomorrow ship:**

### Blocker 1: Validated fix ≠ implementable fix

The implementability audit answers *"Can the replay logic be expressed using real pipeline data at runtime?"* with **"No — not in full"** (verdict **B**). Three of six documented combo gates are **RED**. Proceeding tomorrow means shipping an **adapted rule that has never been offline replay-validated as a whole**, at **75% confidence** per implementation prep — below the **88%** confidence on the frozen documented rule.

### Blocker 2: Known false-positive path with no runtime mitigation proof

The only control that blocks Rolo run 7 on the target invoice is `hybrid_h_qty_2_stable`, which **cannot run in production**. The proposed runtime rule **must omit it**. Sensitivity ablation proves omission causes FP on frozen data. No artifact demonstrates the proposed "conservative combo" blocks run 7 while preserving recall on Mezzi/Ricotta.

### Blocker 3: End-to-end correction path unproven

Extraction-only binding fix leaves VL DB at qty=2 until re-ingest. Impact analysis and readiness.json mark re-ingest, persistence semantics, and price-history rewrite as **requires validation / pending post-deploy**. Implementing extraction tomorrow without a proven re-ingest contract risks **split state**: new uploads corrected, existing VL rows unchanged, or re-ingest producing unexpected catalog/history values (impact analysis class **C** fields).

---

## What IS ready (evidence-backed, not sufficient alone)

These gates are complete and should not be re-litigated:

| Gate | Evidence |
|------|----------|
| Root cause localized to Hybrid H qty 1→2 at stage 4 | `.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/` — Pass C qty=1, Hybrid H qty=2, 10/10 stable |
| Scope bounded to 2 products, 1 invoice, 0 expansion | `.tmp/bug-pattern-expansion-audit/`, `.tmp/family-a-impact-analysis/` §4 |
| Documented Option C replay: 100% recall/precision on frozen artifacts | `.tmp/family-a-option-c-replay/`, `.tmp/family-a-full-population-replay/` (15/15) |
| Downstream pipeline qty-invariant | ricotta/mezzi traces stages 5–11; reconcile unchanged |
| Impact mapping complete for Ricotta + Mezzi | `.tmp/family-a-impact-analysis/` — 27 fields class A, invoice total unchanged |
| Priority ranking #1 among bug families | `.tmp/implementation-priority-audit/` — Readiness A relative to other families |

---

## Pre-implementation gates (read-only recommendation — not fixes)

Before changing `invoice-monetary-binding.ts`:

1. **Offline replay the exact runtime proxy rule** (supplier + qty=2 + discount_pct + inflation signature, **no** stability, **no** passc OCR) against frozen 15-row extract set **and** 15-row effective-paid population — must show 2/2 recall, 0 FP including Rolo run 7.
2. **Confirm supplier threading** into binding or document gate fallback if Pass B unavailable at bind time.
3. **Dry-run re-ingest impact** on VL read-only replay for `f0aa5a08` Ricotta + Mezzi — verify `ingredient_price_history`, `purchase_quantity`, Ricotta usable 1.5 kg, mismatch alert clearance (impact analysis class **C** fields).

---

## Artifact index

| Artifact | Role in this review |
|----------|---------------------|
| `.tmp/ricotta-root-cause-trace/` | Stage trace; first error stage 4 |
| `.tmp/mezzi-root-cause-trace/` | Split-brain mechanism; same stage 4 failure |
| `.tmp/family-a-impact-analysis/` | Downstream blast radius; class C gaps |
| `.tmp/family-a-implementation-prep/` | Proposed Option C + runtime proxies; 75% runtime confidence |
| `.tmp/family-a-implementability-audit/` | **Critical:** verdict B — partial runtime expressibility |
| `.tmp/family-a-option-c-replay/` | 100% replay on documented rule; sensitivity + combo-stress |
| `.tmp/family-a-full-population-replay/` | 15/15 effective-paid; 55% OCR proxy confidence |
| `.tmp/bug-pattern-expansion-audit/` | 0 expansion — scope support |
| `.tmp/implementation-priority-audit/` | Relative priority A; does not resolve runtime gap |

**No code changes. No DB writes. No deployments.**
