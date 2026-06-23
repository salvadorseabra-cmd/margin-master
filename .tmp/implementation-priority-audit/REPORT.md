# Implementation Priority Audit — STRICT READ-ONLY

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes proposed  
**Scope:** Safest highest-confidence implementation order for four confirmed user-visible bug families

---

## Executive Summary

| Rank | Bug family | Readiness | Why this order |
|------|------------|:---------:|----------------|
| **1** | Family A (Ricotta, Mezzi) | **A** | Only family with complete fix design, 100% offline replay, zero expansion, extraction-layer isolation |
| **2** | Mozzarella Fior di Latte 125GR×8 | **B** | Proven root cause and fix design; blocked until `unitMeasurement==='g'` helper validated against S.Pellegrino controls |
| **3** | Ginger Beer 0.20cl | **B** | Isolated mechanism in separate file; no fix design or regression matrix yet |
| **4** | Guanciale Stagionato | **C** | Proven root cause but no fix design; shares `stock-normalization.ts` with Mozzarella in opposite error direction |

**Overall audit confidence: 88%**

---

## 1. Bug Summary Table

| # | Bug family | Symptom (user-visible) | Root cause known? | First incorrect stage | Evidence |
|---|------------|------------------------|:-----------------:|----------------------|----------|
| 1 | **Family A** (Ricotta, Mezzi) | Mezzi: Last Purchase 2 un but usable 6 kg (PDF: 1 case / 6 kg). Ricotta vs PDF: Last Purchase 2 un, €3.99/unit, 3 kg usable, €2.66/kg (PDF: 1 un, €7.97, 1.5 kg, €5.31/kg) | **Yes** (91%) | **Stage 4 — Hybrid H table GPT** (`callOpenAiJson` emits qty=2 where PDF QUANT=1) | `.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/` |
| 2 | **Mozzarella 125GR×8** | Last Purchase 10 un ✓; usable **1 kg** (should 10 kg); operational **€81.20/kg** (should €8.12/kg) | **Yes** (94%) | **Stage 8 — stock normalization** (`computeUsableFromPurchaseStructure` freezes at 1 kg per pack; invoice qty=10 not applied) | `.tmp/mozzarella-implementation-prep/`, `.tmp/remaining-bug-root-causes/` |
| 3 | **Ginger Beer 0.20cl** | Last Purchase 24 ✓; usable **48 ml** (should ~4.8 L); operational **€405/L** (should ~€4/L) | **Yes** (92%) | **Stage 8 — volume inference** (`detectVolume()` parses `0.20cl` as 0.20 centilitres = 2 ml/bottle) | `.tmp/remaining-bug-root-causes/`, `.tmp/bug-pattern-expansion-audit/` |
| 4 | **Guanciale Stagionato** | Last Purchase ~6 un; usable **10.5 kg** (should ~6 kg); operational **€6.18/kg** (should €10.83/kg) | **Yes** (92%) | **Stage 8 — stock normalization** (`*7` pack fiction applied; row weight 5.996 kg ignored) | `.tmp/stock-normalization-family-assessment/`, `.tmp/remaining-bug-root-causes/` |

**Bug family note:** Family A is one mechanism fixing two products. Ricotta is UI class **C** against bound qty fiction but wrong vs PDF; Mezzi is UI class **A** (`.tmp/quantity-mismatch-ui-audit/classifications.json`).

---

## 2. Implementation Confidence

| Bug family | Root cause | Scope | Validation coverage | Overall |
|------------|:----------:|:-----:|:-------------------:|:-------:|
| Family A | **High** (91%) | **High** (90%) — 2 products, 1 invoice, 0 expansion | **High** — 15/15 population replay, 100% Option C recall/precision | **High** |
| Mozzarella | **High** (94%) | **High** (92%) — 1 user-visible, 0 expansion | **Medium** — regression matrix 62%; S.Pellegrino control failure on bare Option A | **Medium–High** |
| Ginger Beer | **High** (92%) | **High** (92%) — 1/51 VL, 0 production matches | **Medium** — root cause proven; no fix replay matrix | **Medium** |
| Guanciale | **High** (92%) | **High** (85%) — 1 confirmed, weight scan found 0 more | **Low** — no fix design, no offline replay | **Medium–Low** |

---

## 3. Regression Risk

| Bug family | Code area | Population size | Risk level | Key controls |
|------------|-----------|----------------:|:----------:|--------------|
| Family A | `invoice-monetary-binding.ts` (edge function) | 15 candidates screened; 2 failures | **Low** | Pomodori, Rolo, Acqua, Mozzarella qty=10, Gorgonzola; 13/13 non-failures unchanged (`.tmp/family-a-implementation-prep/`) |
| Mozzarella | `stock-normalization.ts` (`structureTotalIsFinalForGenericRow`, `computeUsableFromPurchaseStructure`) | 9 SIZE_COUNT_RE rows; 6 proven correct | **Medium** | Peroni (qty=inner), Guanciale (kg exclusion), Stracciatella (bare_measure). **Blocker:** S.Pellegrino×2 regress under bare Option A (`.tmp/mozzarella-regression-matrix/`) |
| Ginger Beer | `ingredient-unit-inference.ts` (`detectVolume`) | 1 VL row; 0 production `0.XXcl` matches | **Low** | Peroni 33cl, S.Pellegrino 75cl (integer CL controls) |
| Guanciale | `stock-normalization.ts` (same path as Mozzarella) | 9 SIZE_COUNT_RE rows | **High** | Must not flip to under-count; opposite direction from Mozzarella; no scoped fix validated |

---

## 4. Blast Radius

| Bug family | Known affected | Potential additional | Spillover |
|------------|---------------|---------------------|-----------|
| Family A | Ricotta trevigiana, Mezzi paccheri mancini (2 invoice items, 1 invoice) | **0** (`.tmp/bug-pattern-expansion-audit/`) | Invoice total €290.64 unchanged; 5 sibling lines on f0aa5a08 unaffected (`.tmp/family-a-impact-analysis/`) |
| Mozzarella | Mozzarella fior di latte (1 invoice item) | **0** user-visible expansion | 5 structural SIZE_COUNT matches UI-correct; **2 S.Pellegrino rows at risk** if helper too broad (`.tmp/mozzarella-regression-matrix/`) |
| Ginger Beer | Baladin Ginger Beer 0.20cl (1 invoice item) | **0** (regex scan 51 VL + 207 production) | Independent of extraction and stock-normalization |
| Guanciale | Guanciale stagionato (1 invoice item) | **0** (weight-semantics scan) | Shared `stock-normalization.ts` with Mozzarella; Mezzi structurally overlaps but primary bug is Family A |

---

## 5. Readiness A/B/C with Evidence

| Bug family | Grade | Evidence |
|------------|:-----:|----------|
| **Family A** | **A — Ready** | Verdict: READY FOR IMPLEMENTATION (Option C) at 82% overall (`.tmp/family-a-implementation-prep/`). Gates complete: root cause 91%, scope 2/15, Option C replay 100% recall/precision, 15/15 full population, impact mapping, 0 expansion. Strategy selected. Blockers: none. Pending: post-deploy 10× stability + VL re-ingest. |
| **Mozzarella** | **B — Needs validation** | Root cause A-proven (94%). Fix design Option A at 89% (`.tmp/mozzarella-fix-design/`). **Regression matrix verdict: B) Control impact** — bare helper regresses S.Pellegrino×2 (62% matrix confidence). Tightened `unitMeasurement==='g'` discriminator identified (`.tmp/mozzarella-vs-pellegrino-separation/`) but **not replay-validated**. Re-ingest path B. |
| **Ginger Beer** | **B — Needs validation** | Root cause proven; isolation proven (1/51). **No fix design document**, no offline replay matrix, no unit-test plan in investigations. Mechanism localized to `detectVolume()` CL regex. |
| **Guanciale** | **C — Not ready** | Root cause proven (`.tmp/stock-normalization-family-assessment/`). Explicit verdict: **separate fix track** from Mozzarella; same subsystem, different semantics (over-count vs under-count). No fix design. size-count-discriminator-audit cluster B — no reusable runtime path discriminator. |

---

## 6. Prioritization Matrix

Scoring: 1 = lowest / worst, 5 = highest / best. **Total = sum of five dimensions.**

| Bug family | Impact (1–5) | Confidence (1–5) | Safety (1–5) | Readiness (1–5) | **Total** |
|------------|:------------:|:----------------:|:------------:|:---------------:|:---------:|
| Family A (Ricotta, Mezzi) | 4 | 5 | 5 | 5 | **19** |
| Mozzarella 125GR×8 | 5 | 4 | 3 | 3 | **15** |
| Ginger Beer 0.20cl | 3 | 4 | 5 | 2 | **14** |
| Guanciale Stagionato | 4 | 3 | 2 | 1 | **10** |

**Impact rationale:**
- Mozzarella: 10× operational cost inflation (€81.20→€8.12/kg); recipe denominator wrong (`.tmp/mozzarella-commercial-reality-audit/`)
- Family A: Mezzi split-brain + Ricotta 2× op-cost error vs PDF; smaller line totals but upstream extraction fix unlocks correct re-ingest
- Guanciale: ~42% op-cost understatement (€6.18 vs €10.83/kg)
- Ginger Beer: absurd €405/L but €19.38 line total; isolated SKU

**Safety rationale:**
- Family A: supplier-scoped extraction gate; no stock-normalization touch
- Ginger Beer: separate file, unique OCR artifact
- Mozzarella: shared SIZE_COUNT path; S.Pellegrino blocker
- Guanciale: opposite-direction change in same functions as Mozzarella

---

## 7. Recommended Order 1–4

### 1st — Family A (Ricotta, Mezzi)

**Why now:**
- Highest total score (19/20) and only **Readiness A** family
- Complete implementation package: Option C in `invoice-monetary-binding.ts`, runtime signal proxies defined, frozen 15-row regression set with **100% recall/precision**
- Fixes upstream before downstream re-ingest; does not touch `stock-normalization.ts` shared by Mozzarella/Guanciale
- Scope provably closed: 0 pattern expansion (`.tmp/bug-pattern-expansion-audit/`)

**Evidence:**
- First error: Hybrid H qty 1→2, 10/10 stable (`.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/`)
- Option C replay: 2/2 failures corrected, 0 FP (`.tmp/family-a-option-c-replay/`)
- Full population: 15/15 verified (`.tmp/family-a-full-population-replay/`)

**Remaining risk:**
- Runtime-adapted rule without Pass C `ocr_qty_eq_1` proxy: 75% confidence match (`.tmp/family-a-implementation-prep/`)
- Mandatory post-deploy 10× Bocconcino stability; Rolo run 7 transient monitor-only
- Ricotta downstream shift €2.66→€5.31/kg is expected correction, not regression

---

### 2nd — Mozzarella Fior di Latte 125GR×8

**Why second (not first):**
- Higher per-product economic impact than Family A, but **Readiness B** with active control blocker
- Must implement **after** Family A to avoid simultaneous extraction + stock-normalization changes on same invoice (`f0aa5a08`)
- Fix design exists but bare Option A helper **regresses S.Pellegrino×2** (usable 11.25→22.5 L, op €3.73→€1.86/L) per `.tmp/mozzarella-regression-matrix/`

**Evidence:**
- Extraction stages 1–7 correct; first wrong at stage 8 (`.tmp/mozzarella-implementation-prep/`)
- Commercial 10 kg proven at 95% (`.tmp/mozzarella-commercial-reality-audit/`)
- Tightened discriminator `unitMeasurement==='g'` separates Mozzarella from Pellegrino cl rows (`.tmp/mozzarella-vs-pellegrino-separation/`) — **design only, not matrix-validated**

**Remaining risk:**
- Implement with g-only helper; re-run full 8-row regression matrix before merge
- Re-ingest `f0aa5a08` after deploy
- Guanciale kg-exclusion must hold (verified in matrix)
- Cross-format identity / price-history secondary (non-blocking)

---

### 3rd — Ginger Beer 0.20cl

**Why third:**
- Isolated (1 VL, 0 production expansion); **safest blast radius** after Family A and scoped Mozzarella
- Independent code path (`ingredient-unit-inference.ts`) — no coupling to Family A extraction or SIZE_COUNT policy
- Lower line economics than Mozzarella/Guanciale

**Why not second:**
- No fix design document or offline replay matrix in completed investigations
- Readiness lower than Mozzarella despite simpler mechanism

**Evidence:**
- `0.20cl` OCR typo → 2 ml/bottle (`.tmp/remaining-bug-root-causes/`)
- Integer CL controls correct: Peroni 33cl, S.Pellegrino 75cl (`.tmp/bug-pattern-expansion-audit/`)
- UI class A confirmed (`.tmp/quantity-mismatch-ui-audit/`)

**Remaining risk:**
- Fix must not broaden CL regex to affect integer `NNcl` patterns
- Invoice `17aa3591` extract-only (not VL DB) — validate on deployed path
- Requires fix design + replay before implementation (not yet in artifact set)

---

### 4th — Guanciale Stagionato

**Why last:**
- Lowest readiness (**C**); **no fix design** in investigations
- Same `stock-normalization.ts` subsystem as Mozzarella but **opposite error direction** (over-count vs under-count) — must not implement until Mozzarella g-only fix is proven in production
- size-count-discriminator-audit: three incorrect SIZE_COUNT products are **three distinct clusters** (A under-count, B over-count, C extraction); no shared runtime path separates Guanciale from correct rows

**Evidence:**
- Weight line 5.996 kg → usable 10.5 kg from `1,5kg*7` fiction (`.tmp/stock-normalization-family-assessment/`)
- 0 expansion on weight-semantics scan (`.tmp/bug-pattern-expansion-audit/`)
- Explicit: "Guanciale requires separate weight-semantics track" (`.tmp/stock-normalization-population-audit/`, `.tmp/mozzarella-fix-design/`)

**Remaining risk:**
- Fix likely requires weight-line recognition + suppression of supplier case metadata — design not started
- Naive SIZE_COUNT policy change would worsen Guanciale (Option C in mozzarella-fix-design)
- Must follow Mozzarella with proven decoupling

---

## 8. Stop Condition

| Bug family | Additional investigation required? |
|------------|-----------------------------------|
| Family A | **No** — proceed to implementation with pre-flight checks only (runtime proxy validation, unit tests, post-deploy 10× stability) |
| Mozzarella | **Yes — one gate:** re-run regression matrix with `unitMeasurement==='g'` tightened helper; confirm S.Pellegrino op €/L unchanged before merge |
| Ginger Beer | **Yes:** fix design + offline replay matrix for `detectVolume()` decimal-cl handling; confirm no integer-CL regression |
| Guanciale | **Yes:** weight-semantics fix design; offline replay distinguishing weight lines from count lines with `*N` metadata; must not proceed until Mozzarella track complete |

**Global stop:** No additional root-cause investigation required for any family. Remaining work is **fix scoping validation** (Mozzarella helper tightening, Ginger/Guanciale design) — not new causal analysis.

---

## Cross-Family Dependencies

```
Family A (extraction) ──► independent; deploy first
         │
         ▼
Mozzarella (stock-norm g-only) ──► must validate S.Pellegrino before merge
         │
         ├──► Ginger Beer (volume inference) ──► parallel-safe after Mozzarella merge
         │
         └──► Guanciale (weight semantics) ──► must wait for Mozzarella decoupling proof
```

**Same-invoice note:** Ricotta, Mezzi, Mozzarella share invoice `f0aa5a08`. Sequential fixes + single re-ingest after each deploy is safer than bundled change.

---

## Confidence

| Section | Confidence |
|---------|:----------:|
| Bug summary & first-incorrect stages | **95%** |
| Family A prioritization (#1) | **91%** |
| Mozzarella prioritization (#2) + S.Pellegrino blocker | **88%** |
| Ginger Beer prioritization (#3) | **85%** |
| Guanciale prioritization (#4) | **90%** |
| **Overall audit** | **88%** |

---

## Sources (read-only)

| Artifact | Use |
|----------|-----|
| `.tmp/ricotta-root-cause-trace/`, `.tmp/mezzi-root-cause-trace/` | Family A stage traces |
| `.tmp/family-a-impact-analysis/`, `.tmp/family-a-implementation-prep/` | Impact + readiness |
| `.tmp/mozzarella-implementation-prep/`, `.tmp/mozzarella-fix-design/` | Mozzarella target + design |
| `.tmp/mozzarella-regression-matrix/`, `.tmp/mozzarella-vs-pellegrino-separation/` | Control blocker |
| `.tmp/mozzarella-commercial-reality-audit/` | 10 kg commercial proof |
| `.tmp/stock-normalization-family-assessment/`, `.tmp/stock-normalization-population-audit/` | Guanciale + population |
| `.tmp/size-count-discriminator-audit/` | Three-cluster separation |
| `.tmp/remaining-bug-root-causes/`, `.tmp/bug-pattern-expansion-audit/` | Root causes + expansion |
| `.tmp/quantity-mismatch-ui-audit/` | User-visible confirmation |

**No code changes. No DB writes. No deployments.**
