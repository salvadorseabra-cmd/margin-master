# Guanciale — Implementation Readiness Audit

**Generated:** 2026-06-23  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes  
**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore Portugal, 2026-05-19)  
**Line:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)

---

## Executive Summary

**Verdict: NOT READY for implementation.**

Root-cause investigation is **strong** (stage 8 stock normalization; production replay reproduces 10.5 kg usable vs ~6 kg expected). Commercial reality for purchased weight is **B — Likely**, not **A — Proven**, because the PDF unit column reads `UN` rather than `kg` and weight semantics are inferred from qty magnitude and €/kg pricing. Unlike Mozzarella and Ginger Beer at their READY moments, Guanciale lacks a dedicated implementation-prep artifact, fix-design artifact, positive regression matrix, and a proven runtime discriminator for a safe code change. The shared `SIZE_COUNT_RE` path couples Guanciale to Mozzarella fixes in the opposite error direction (over-count vs under-count).

**Confidence:** 0.84 overall (root cause 0.92, commercial reality 0.86, implementation readiness 0.72)

---

## Task 1 — Root Cause Certainty Table

| Dimension | Finding | Classification |
|-----------|---------|:--------------:|
| **First incorrect stage** | Stage 8 — Purchase structure / stock normalization | **A — Proven** |
| **First incorrect value** | Usable weight **10 500 g** (should **~5 996 g**) | **A — Proven** |
| **Commercial reality (purchased mass)** | ~6 kg at effective **€10.83/kg** (= €64.93 ÷ 5.996) | **B — Likely** |
| **Parser path** | `parsePurchaseStructureFromText` → `SIZE_COUNT_RE` match `1,5kg*7` → tier `size_count` → `computeUsableFromPurchaseStructure` → `structureTotalIsFinalForGenericRow` → `usableSource: structure_total` → **10 500 g** | **A — Proven** |
| **Competing explanations** | See table below | — |

### Competing explanations (elimination)

| Explanation | Plausible? | Verdict | Evidence |
|-------------|:----------:|---------|----------|
| **A — Row qty is purchased kilograms; `*7` is supplier case metadata only** | Yes | **Primary** | `5.996 × €10.83 ≈ €64.93` exact; `7 × 1.5 kg × €10.83 = €113.72` contradicts total |
| B — Customer bought 7 pieces × 1.5 kg (10.5 kg) | No | Rejected | Line total €64.93; 10.5 kg at €10.83/kg would be €113.72 |
| C — Invoice qty 5.996 means 7 pieces (~0.856 kg each) | No | Rejected | Name says ~1.5 kg/piece; 7 × 0.856 ≠ semantic `1,5kg*7` |
| D — Extraction corrupted qty or total | No | Ruled out | Stages 4–7 preserve qty=5.996, unit_price=10.83, total=64.93 |
| E — `*7` is outer case count to multiply (like Mozzarella outer packs) | No | Rejected | Would yield 7 × 10.5 kg fiction if scaled; row qty is weight not case count |
| F — Unit column `UN` means 6 discrete pieces | Partial | Weak | Qty 5.996 is fractional; inconsistent with integer piece count; weight-priced |

**Live production replay (2026-06-23):**

```
Input:  name="Guanciale … +/- 1,5kg*7 …", rowQuantity=5.996, rowUnit="un"
Output: normalizedUsableQuantity=10500, purchaseContainerCount=7
        usableSource=structure_total
        fallbackReason="name N×SIZE total is final; generic row does not rescale inner pack"
        expression="1 × 7 × 1.5 kg"
```

Sources: `.tmp/remaining-bug-root-causes/`, `.tmp/stock-normalization-family-assessment/`, `.tmp/quantity-mismatch-ui-audit/replay.json`, live `resolveInvoiceLinePurchaseFormat` replay.

---

## Task 2 — Commercial Reality Audit

Methodology reference: `.tmp/mozzarella-commercial-reality-audit/` (OCR + monetary reconciliation + peer controls).

### Invoice ground truth

Source: `.tmp/mammafiore-line-audit/ground-truth.json`, `.tmp/mammafiore-line-audit/REPORT.md`, `.tmp/geometry-audit/images/36c99d19-6f9f-413f-8c2d-ae3526291a2d.png`

| Field | Value | Class | Evidence |
|-------|------:|:-----:|----------|
| **Purchased qty** | **5.996** | **A — Proven** | PDF Qtd=5,996; ground-truth; Hybrid H extract; VL `invoice_items`; UI replay bound qty |
| **Unit (PDF column)** | **UN** (`un`) | **A — Proven** | Ground-truth; persisted row unit `un` |
| **Gross unit price** | **€16.922/kg** | **A — Proven** | PDF Pr.=16,922; ground-truth unit_price |
| **Discount** | **36%** | **A — Proven** | remaining-bug-root-causes stage 1 |
| **Line total (net)** | **€64.93** | **A — Proven** | PDF Valor=64,93; DB; extract; money-audit MATCH |
| **Effective unit price** | **€10.83/kg** | **A — Proven** | `5.996 × 10.83 ≈ 64.93`; Hybrid H unit_price=10.83 |
| **Expected usable mass** | **~5.996 kg (~6 kg)** | **B — Likely** | Row qty with €/kg pricing implies weight; unit column not `kg` |
| **Expected operational cost** | **€10.83/kg** | **B — Likely** | `€64.93 ÷ 5.996 kg`; not **A** until weight semantics proven from unit column |
| **Pack notation `*7`** | Supplier case shape (7 × ~1.5 kg per case) | **B — Likely** | Consistent with Bocconcino `*N` = inner/case metadata pattern; no second Guanciale invoice to cross-check |

### Monetary reconciliation

```
5.996 kg × €16.922 gross     = €101.59
Less 36% discount            = €36.57
Net total                    = €64.93  ✓ (matches invoice, DB, extract)

Correct operational cost     = €64.93 ÷ 5.996 kg = €10.83/kg
System operational cost      = €64.93 ÷ 10.5 kg  = €6.18/kg  ✗
```

### Peer control (same invoice `36c99d19`)

| Product | Invoice qty | Notation | Expected usable | System usable | Economics |
|---------|------------:|----------|----------------:|--------------:|:---------:|
| **Guanciale** | 5.996 | `1,5kg*7` | ~6 kg (weight line) | **10.5 kg** | **Wrong** |
| Mozzarella julienne | 10 | `3kg` (bare) | 30 kg | 30 kg | Correct |
| Rulo di capra | 1 | `1kg*2` | 2 kg | 2 kg | Correct |
| Peroni | 24 | `33cl*24` | 7.92 L | 7.92 L | Correct |
| Farina Amoruso | 1 | `25kg` | 25 kg (weight_based) | row-weight aligned | Correct |

Guanciale is the **only** Mammafiore `SIZE_COUNT_RE` line with fractional generic-row qty and kg-sized token — unique within VL.

### Current vs expected (production replay)

| Surface | Commercial expectation | System (VL UI replay) | Wrong? |
|---------|---------------------|----------------------|:------:|
| Last Purchase qty | ~6 kg | **6.00 un** (rounded) | Borderline |
| Procurement price | €10.83/kg | **€10.83/unit** | Mislabeled unit |
| Usable stock | **~6 kg** | **10.5 kg** | **Yes** |
| Operational cost | **€10.83/kg** | **€6.18/kg** | **Yes** |
| Line total | €64.93 | €64.93 | No |

Sources: `.tmp/quantity-mismatch-ui-audit/replay.json`, `.tmp/quantity-mismatch-ui-audit/classifications.json` (class **A** user-visible bug).

---

## Task 3 — Implementation Readiness Areas

| Area | Mozzarella @ READY | Ginger Beer @ READY | Guanciale now | Class |
|------|:------------------:|:-------------------:|:-------------:|:-----:|
| Root cause localized to function + stage | A — `computeUsableFromPurchaseStructure` / stage 8 | A — `detectVolume` / stage 8 | A — same subsystem; stage 8; `structure_total` = 10500 g | **A** |
| Extraction ruled out (stages 1–7) | A | A | A — qty=5.996, total=64.93 preserved | **A** |
| Live replay matches persisted VL | A | A | A — replay 10500 g = UI 10.5 kg | **A** |
| Commercial reality proven | A — 10 kg OCR + € math | A/B — 20 cl typo + SKU alt | **B** — weight from qty+€/kg; unit column `UN` | **B** |
| Dedicated commercial-reality audit | Yes | Embedded in closure | **No** | **C** |
| Population / isolation scan | A — 1/51 user-visible | A — 1/51 decimal-cl | A — 1/51 VL row; cluster `B_guanciale_over_count` | **A** |
| Fix design artifact | C in prep; design doc exists | B partial | **None** | **C** |
| Implementation prep artifact | Yes (`mozzarella-implementation-prep/`) | Closure only | **None** | **C** |
| Runtime fix discriminator | A — outer-pack g scaling | A — decimal CL guard | **No** — discriminator audit: scalar divergence only | **C** |
| Positive regression matrix | B — needs validation | A — Peroni, S.Pellegrino | **No** Guanciale-specific must-correct suite | **C** |
| Negative regression controls | B — 5 SIZE_COUNT rows | A — integer CL controls | B — listed as Mozzarella design controls only | **B** |
| Re-ingest path validated | B | Not required for closure | B — not validated for Guanciale | **B** |
| Decoupling from sibling bugs | A — Guanciale separate track | A — orthogonal path | B — shares `SIZE_COUNT_RE` + `structureTotalIsFinalForGenericRow` with Mozzarella | **B** |
| Price-history / contamination | B — separate track | Low impact | B — stale history (stored €10.83 vs recomputed €1.81 op) | **B** |

---

## Task 4 — Blocker Search (reasons NOT to implement)

Actively identified blockers:

1. **No fix-design artifact** — Mozzarella had `.tmp/mozzarella-fix-design/` before implementation; Ginger Beer had proposed fix surface in closure doc. Guanciale has **zero** design artifact specifying change locus, guard conditions, or acceptance criteria.

2. **No implementation-prep artifact** — Mozzarella READY required `.tmp/mozzarella-implementation-prep/` with pipeline map, change surface, test plan. Guanciale has trace reports only.

3. **No runtime discriminator for safe fix** — `.tmp/size-count-discriminator-audit/`: all 9 `SIZE_COUNT_RE` products share identical code path; **no parser branch separates Guanciale from correct rows**. Proposed Mozzarella outer-pack helper (`shouldScaleOuterPackForSizeCountGenericRow`, g-only) **explicitly excludes** Guanciale (kg pack). Implementing without a proven discriminator risks regressing Peroni, Rulo, Aceto, or Mozzarella.

4. **Opposite error direction from Mozzarella** — Mozzarella under-counts (needs outer multiply); Guanciale over-counts (needs weight-line suppression). A blanket `SIZE_COUNT_RE` policy change cannot address both (`.tmp/stock-normalization-family-assessment/`).

5. **Commercial weight semantics not A-Proven** — PDF unit is `UN`, not `kg`. Residual uncertainty (0.08–0.12) documented in family assessment. Fix target mass is inferred, not unit-column canonical.

6. **Single VL exemplar** — 1/51 rows; no second Guanciale invoice to validate `*7` metadata interpretation or weight-line heuristic.

7. **Misleading prior audit signal** — `.tmp/purchase-unit-intelligence-audit/COUNTABLE_AUDIT.md` classified Guanciale procurement as **VALID** ("Weight-per-piece × row count") — contradicts quantity-mismatch class **A** bug. Indicates prep gap / conflicting audit frames.

8. **Historical pricing contamination** — `.tmp/historical-pricing-integrity-audit/findings.json`: stored `new_price=10.83` vs recomputed operational €1.806; post-fix re-ingest and history semantics need validation.

9. **No implementation-validation replay** — Mozzarella and Ginger Beer had `.tmp/mozzarella-implementation-validation/` and `.tmp/ginger-beer-implementation-validation/` **after** design. Guanciale has no equivalent baseline.

10. **Mozzarella fix track explicitly deferred Guanciale** — `.tmp/mozzarella-implementation-prep/` and `.tmp/mozzarella-fix-design/`: Guanciale is out-of-scope control, not scheduled parallel work.

---

## Task 5 — Comparison Table at READY Moment

| Criterion | Mozzarella @ READY | Ginger Beer @ READY | Guanciale now |
|-----------|:------------------:|:-------------------:|:-------------:|
| **Verdict label** | READY (scoped fix design) | READY (root-cause closure) | **NOT READY** |
| **First wrong stage** | 8 — stock norm | 8 — volume inference | 8 — stock norm |
| **First wrong value** | 1 000 g usable | 2 ml/bottle | 10 500 g usable |
| **Extraction bug** | No | No | No |
| **Mechanism** | Outer pack qty not scaled | `0.20cl` → 2 ml | `*7 × 1.5 kg` fiction vs row weight |
| **Error direction** | Under-count | Under-count (volume) | **Over-count** |
| **Commercial reality class** | **A — Proven** (10 kg) | **A/B** (4.8 L primary) | **B — Likely** (~6 kg) |
| **Dedicated prep doc** | Yes | Closure doc | **No** |
| **Fix design doc** | Yes (post-prep) | Partial in closure | **No** |
| **Fix surface clarity** | 3 functions + policy gate | 1 function (`detectVolume`) | Shared policy; **no Guanciale-specific surface** |
| **Isolation** | 1 user-visible VL row | 1 VL row | 1 VL row |
| **Regression controls** | 5 SIZE_COUNT negatives | Peroni, S.Pellegrino | Negatives in Mozzarella doc only |
| **Implementation validation** | Planned in prep | Post-closure | **Not planned** |
| **Overall confidence** | 0.91 | 0.92 | **0.84** |

---

## Task 6 — Final Verdict

### **NOT READY**

**Ready for:** root-cause documentation and commercial investigation closure (analogous to pre-prep Ginger Beer / Mozzarella trace phase).

**Not ready for:** code change, fix design sign-off, or re-ingest.

### Missing evidence before implementation

| # | Gap | Required artifact / action |
|---|-----|---------------------------|
| 1 | Weight-line semantics A-Proven | Dedicated commercial-reality audit with PDF unit-column analysis; peer weight lines on Mammafiore (Farina 25kg `weight_based` control) |
| 2 | Fix location + guard conditions | `guanciale-fix-design/` equivalent — must not rely on Mozzarella g-only outer scaling |
| 3 | Runtime discriminator | Evidence that a proposed guard fires on Guanciale only (or safe subset), not Peroni/Rulo/Aceto |
| 4 | Implementation prep | Pipeline map, change surface, impact analysis, re-ingest plan for `36c99d19` |
| 5 | Positive regression matrix | Must-correct: usable ~5996 g, op ~€10.83/kg; must-not-regress: Peroni, Rulo, Mozzarella julienne, Farina lines |
| 6 | Re-ingest validation | Confirm `syncOperationalIngredientCostsFromInvoiceLines` propagates corrected usable without manual DB edit |
| 7 | Price-history follow-on | Validate operational history after fix (stale €10.83 vs €1.806 recomputed) |

### Post-implementation validation sequence (when fix exists)

1. **Production replay** — `resolveInvoiceLinePurchaseFormat` on persisted line → `normalizedUsableQuantity ≈ 5996 g`, not 10500 g.
2. **Operational cost** — `computeEffectiveUsableCost` → **~€10.83/kg** (= €64.93 ÷ 5.996 kg).
3. **UI replay** — Ingredient detail: usable **~6 kg**; op **€10.83/kg**; Last Purchase ~6 un; proc €10.83/unit unchanged.
4. **Invoice row unchanged** — `invoice_items` qty=5.996, unit_price=10.83, total=64.93 (no extraction change).
5. **Re-ingest `36c99d19`** — catalog `usable_weight_grams` and ingredient economics update.
6. **Negative regression (same invoice)** — Peroni, Aceto, Mozzarella julienne, Rulo, Farina lines unchanged.
7. **Cross-invoice SIZE_COUNT** — Pomodori, S.Pellegrino×2, Peroni (Bocconcino if applicable) unchanged.
8. **Mozzarella coupling check** — If Mozzarella fix landed, Guanciale fix must not flip to under-count or break Mozzarella controls.
9. **Price history** — `ingredient_price_history.new_price` reflects operational €/kg semantics post sync.

---

## Stage Trace (abbreviated)

| Stage | Qty | Unit price | Total | Usable | OK? |
|------:|----:|-----------:|------:|-------:|:---:|
| 1 PDF | 5.996 | 16.922 | 64.93 | ~6 kg | ✓ |
| 4 Hybrid H | 5.996 | 10.83 | 64.93 | — | ✓ |
| 5–6 bind/reconcile | 5.996 | 10.83 | 64.93 | — | ✓ |
| 7 VL persist | 5.996 | 10.83 | 64.93 | — | ✓ |
| **8 stock norm** | 5.996 | 10.83 | 64.93 | **10.5 kg** | **✗** |
| 9 UI | 6.00 un | €10.83/unit | **€6.18/kg** | **10.5 kg** | **✗** |

---

## Confidence

| Dimension | Score |
|-----------|------:|
| Root cause localization | 0.92 |
| Commercial reality (purchased weight) | 0.86 |
| Parser path / replay fidelity | 0.94 |
| Fix-surface / discriminator readiness | 0.58 |
| Regression / isolation | 0.80 |
| **Overall readiness** | **0.84** |

---

## Sources (read-only)

| Artifact | Use |
|----------|-----|
| `.tmp/remaining-bug-root-causes/` | Stage trace, first incorrect value |
| `.tmp/stock-normalization-family-assessment/` | Mozzarella vs Guanciale causal comparison |
| `.tmp/stock-normalization-population-audit/` | VL population, SIZE_COUNT path |
| `.tmp/size-count-discriminator-audit/` | Blocker: no runtime discriminator |
| `.tmp/quantity-mismatch-ui-audit/` | UI replay, class A confirmation |
| `.tmp/mammafiore-line-audit/` | PDF ground truth, monetary MATCH |
| `.tmp/mozzarella-implementation-prep/` | READY benchmark |
| `.tmp/mozzarella-commercial-reality-audit/` | Methodology reference |
| `.tmp/mozzarella-fix-design/` | Coupling / negative controls |
| `.tmp/ginger-beer-root-cause-closure/` | READY benchmark |
| `.tmp/final-validation-lab-rerun/extracts/36c99d19-…json` | Hybrid H extract |
| `.tmp/historical-pricing-integrity-audit/findings.json` | Stale history signal |
| `src/lib/stock-normalization.ts` | Parser + usable derivation |
| VL `invoice_items` via `.tmp/mammafiore-line-audit/db-invoice-items.json` | Persisted row corroboration |
