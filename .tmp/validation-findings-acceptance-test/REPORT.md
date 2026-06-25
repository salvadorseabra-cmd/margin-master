# Validation Findings — Acceptance Test

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Mode:** READ-ONLY — no code, threshold, or wording changes  
**Harness:** `.tmp/validation-findings-acceptance-test/replay.mts` → `results.json`

---

## Executive Summary

Validation Findings correctly surfaces **two high-value economics problems** on the VL corpus (Guanciale pack-weight normalization, Aceto row math) and **38 catalog-matching signals** across suppliers. The engine is **directionally shippable** for restaurant managers, but **operational and math findings are not yet understandable without engineering context** — evidence labels, jargon, and missing OCR persistence block day-one trust.

**Ship recommendation: Yes with minor polish**

| Metric | Value |
|--------|------:|
| Invoices reviewed | 7 |
| Invoice rows reviewed | 52 |
| Total findings emitted | 40 |
| Rows with ≥1 finding | 38 |
| Distinct finding codes observed | 4 of 9 |
| False positives (genuine) | 0 |
| Misleading / insufficient-evidence findings | 1 |
| False negatives (actionable gaps) | 2 |

---

## Methodology

1. Read prior audits: validation-rules-coverage, validation-findings-ux-quality-pass, procurement-vs-operational, guanciale-readiness, final-gorgonzola-validation, emporio-deli-stability, vl-final-state-audit.
2. Queried VL Supabase for all invoices and `invoice_items` (52 rows across 7 suppliers).
3. Replayed `validateInvoiceLine()` with production match resolution (`resolveInvoiceTableRowIngredientMatch` + persisted `invoice_item_matches` cutover), mirroring `invoices.tsx` validation input wiring.
4. Cross-referenced known problem rows: Guanciale, Gorgonzola, Peroni, Mozzarella, Aceto, Ginger Beer.
5. Scored each **observed** finding code on Clarity, Accuracy, Actionability (1–5).

**Note:** `ocrMeta` is not persisted to DB; replay uses `ocrMeta: null` (same as invoice page reload). OCR findings can only appear immediately after fresh extraction in-session.

---

## Findings Reviewed

### Totals

| Metric | Count |
|--------|------:|
| Total findings | 40 |
| Extraction / math / operational (review-row) | 2 |
| Matching (catalog) | 38 |

### Per-supplier summary

| Supplier | Rows | Findings | Codes observed |
|----------|-----:|---------:|----------------|
| Mammafiore Portugal | 8 | 10 | `OPERATIONAL_NORMALIZATION_INCONSISTENCY` (1), `MATHEMATICAL_INCONSISTENCY` (1), `SUGGESTED_INGREDIENT_MATCH` (6), `UNMATCHED_INGREDIENT` (2) |
| Aviludo | 9 | 9 | `UNMATCHED_INGREDIENT` (7), `SUGGESTED_INGREDIENT_MATCH` (2) |
| Avijudo | 8 | 8 | `UNMATCHED_INGREDIENT` (5), `SUGGESTED_INGREDIENT_MATCH` (3) |
| Emporio Italia | 8 | 6 | `SUGGESTED_INGREDIENT_MATCH` (4), `UNMATCHED_INGREDIENT` (2) |
| Bidfood Portugal, SA | 11 | 4 | `SUGGESTED_INGREDIENT_MATCH` (3), `UNMATCHED_INGREDIENT` (1) |
| Il Bocconcino Distribuição Alimentar | 7 | 2 | `SUGGESTED_INGREDIENT_MATCH` (1), `UNMATCHED_INGREDIENT` (1) |
| Mais Lenhas & Carvão | 1 | 1 | `UNMATCHED_INGREDIENT` (1) |

### Code frequency (live VL)

| Code | Count | Exercised? |
|------|------:|:----------:|
| `UNMATCHED_INGREDIENT` | 19 | ✓ |
| `SUGGESTED_INGREDIENT_MATCH` | 19 | ✓ |
| `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | 1 | ✓ |
| `MATHEMATICAL_INCONSISTENCY` | 1 | ✓ |
| `PLACEHOLDER_ITEM_NAME` | 0 | — |
| `MISSING_QUANTITY_UNIT` | 0 | — |
| `MISSING_AMOUNT` | 0 | — |
| `MATHEMATICAL_RECONCILIATION_FAILURE` | 0 | — |
| `OCR_QUANTITY_MISMATCH` | 0 | — |

---

## Per-finding qualitative review (observed instances)

### Guanciale — `OPERATIONAL_NORMALIZATION_INCONSISTENCY` (Mammafiore)

| Criterion | Assessment |
|-----------|------------|
| Correct? | **Yes** — 5.996 kg billed vs 10.5 kg from `1,5kg*7` name → €10.83/kg vs €6.18/kg (42.9% gap) |
| Real problem? | **Yes** — recipe costing would use wrong €/kg |
| Understandable? | **No** — “Operational mismatch”, “pack structure normalization” |
| Evidence explains issue? | **Partially** — numbers are right but €/kg may render as “kg” in hover UI |
| Suggested action useful? | **Partially** — asks right question but uses “pack notation” / “usable stock” jargon |
| User could resolve? | **Unlikely without support** — needs plain “weight on invoice vs packs in name” framing |

### Aceto balsamico — `MATHEMATICAL_INCONSISTENCY` (Mammafiore)

| Criterion | Assessment |
|-----------|------------|
| Correct? | **Yes** — 1 × €15.55 = €15.55 ≠ €16.09 (€0.54 / 3.4%) |
| Real problem? | **Yes** — likely qty should be 2 (`5l*2` in name) or unit price wrong |
| Understandable? | **Mostly** — “Math inconsistency” is vague but description is plain |
| Evidence explains issue? | **Yes** — calculated €15.55 vs invoice €16.09 |
| Suggested action useful? | **Yes** — tells user to fix one of three fields |
| User could resolve? | **Yes** — check invoice PDF for qty/price |

### Matching findings (19 unmatched + 19 suggested)

| Criterion | Assessment |
|-----------|------------|
| Correct? | **Yes** — align with matcher `displayState` and persisted cutover |
| Real problem? | **Yes for VL** — catalog hygiene is a real manager task |
| Understandable? | **Yes** — clearest finding family |
| Evidence? | **Good** — item name + suggested ingredient name populated |
| Actionable? | **Yes** — “Match or create” / “Confirm suggested match” |
| Resolve? | **Yes** — standard catalog workflow |

**Noise note:** 38/40 findings are matching — economics/extraction findings are rare on current VL data. Managers may perceive the feature as “match reminders” rather than “invoice validation” until more extraction/operational rules fire.

---

## False Positives

| Row / Code | Classification | Rationale |
|------------|----------------|-----------|
| *(none)* | — | No finding was detected on a row that is objectively correct and requires no action |

**Borderline / quality issues (not counted as false positives):**

| Row / Code | Classification | Rationale |
|------------|----------------|-----------|
| Guanciale `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | **Misleading wording** | Finding is **correct**; title/description/evidence units would confuse a non-technical owner (per UX quality pass) |
| 19× `SUGGESTED_INGREDIENT_MATCH` | **Low severity noise** | Genuine catalog signals at `info` severity — appropriate, not false |

**Duplicate finding check:** Zero rows emitted both `MATHEMATICAL_RECONCILIATION_FAILURE` and `MATHEMATICAL_INCONSISTENCY` on live data. Gorgonzola canonical dual-badge scenario not present in current DB.

---

## False Negatives

| Invoice | Row | Expected finding | Why missing | Severity |
|---------|-----|------------------|-------------|----------|
| All invoices (on page reload) | Any row with OCR qty disagreement | `OCR_QUANTITY_MISMATCH` | `extraction_meta` / `ocrMeta` is session-only; not persisted or replayed on invoice open | **High** — known structural gap |
| Emporio — Gorgonzola (historical) | `1.30 kg × €9.88 ≠ €13.44` | `MATHEMATICAL_INCONSISTENCY` | **Not a current false negative** — DB now has corrected PDF triple `1.35 × €9.95 = €13.44` (item `5fab58a8`). Engine **would** flag stale triple per unit tests | — |
| Emporio — Ginger Beer | `24 × €0.81 = €19.44` vs total €19.38 | Optional math review | €0.06 / 0.31% — below intentional OR thresholds | **Low** — acceptable tolerance |
| Mammafiore — Peroni | `24 × €1.07 = €25.68` vs €25.69 | Optional math review | €0.01 rounding | **Low** |
| Bidfood / Bocconcino (7 rows) | Various produce lines | Sub-threshold math | €0.01–€0.13 gaps, all &lt;0.5% | **Low** |
| Any invoice | Row internally consistent but wrong vs PDF | Extraction accuracy vs ground truth | No rule compares persisted values to PDF/OCR truth on reload | **Medium** — design gap |

**Actionable false negative count: 2** (OCR session gap + no PDF-ground-truth validation on reload). Sub-threshold rounding rows excluded — intentional tolerance, not manager-actionable bugs.

---

## UX Scores per Finding Code (1–5)

Scores apply to **codes observed in live VL** unless noted. Clarity = owner understands without help; Accuracy = finding reflects real issue; Actionability = user knows next step.

| Code | Observed (n) | Clarity | Accuracy | Actionability | Notes |
|------|-------------:|--------:|---------:|--------------:|-------|
| `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | 1 | 2 | 5 | 3 | Correct detection; worst owner-facing copy and evidence units |
| `MATHEMATICAL_INCONSISTENCY` | 1 | 3 | 5 | 4 | Good numbers; “inconsistency” / “reconcile” jargon |
| `UNMATCHED_INGREDIENT` | 19 | 4 | 5 | 4 | “Catalog” / “canonical” slightly jargony |
| `SUGGESTED_INGREDIENT_MATCH` | 19 | 5 | 5 | 5 | Best-in-class; reference pattern for other codes |
| `PLACEHOLDER_ITEM_NAME` | 0 | 4† | 5† | 5† | †From UX pass / unit tests; not exercised on VL |
| `MISSING_QUANTITY_UNIT` | 0 | 3† | 5† | 4† | †Not exercised — VL extraction complete |
| `MISSING_AMOUNT` | 0 | 4† | 5† | 5† | †Not exercised |
| `MATHEMATICAL_RECONCILIATION_FAILURE` | 0 | 3† | 5† | 3† | †Would duplicate math error badge on Gorgonzola canonical state |
| `OCR_QUANTITY_MISMATCH` | 0 | 2† | 5† | 4† | †Never fires on reload; OCR/Pass-C jargon |

---

## Known problem row cross-reference

| Control | Item | Expected | Actual (live VL) | Verdict |
|---------|------|----------|------------------|---------|
| Guanciale | `6efebedf…` | Operational flag | `OPERATIONAL_NORMALIZATION_INCONSISTENCY` + suggested match | **Pass** — core economics finding fires |
| Gorgonzola | `5fab58a8…` (current) | Math flag if wrong triple | No math finding; triple reconciles (1.35×9.95≈13.44) | **Pass** — correct silence |
| Peroni | `979a9928…` | No operational flag | Only `SUGGESTED_INGREDIENT_MATCH` | **Pass** |
| Mozzarella Julienne | Bocconcino `f2a672e0…` | No operational flag | Only suggested match | **Pass** |
| Aceto | `1ccf0bd0…` | Math or silence | `MATHEMATICAL_INCONSISTENCY` | **Pass** |

---

## Overall Assessment

### Would you ship today?

**Yes with minor polish**

**Why yes:**
- Findings engine is wired end-to-end and fires on real VL problems managers care about (Guanciale €/kg error, Aceto row math, catalog matching).
- No observed false positives on economics controls (Peroni, Mozzarella multipack).
- Matching findings are genuinely useful and well-written.
- `MATHEMATICAL_INCONSISTENCY` OR-threshold catches Aceto-style sub-5% euro gaps that legacy AND-gate missed.

**Why not “ship today” without polish:**
- The **highest-value finding** (Guanciale operational) is **not understandable** to a typical restaurant manager in current copy/evidence form.
- **OCR quantity mismatch** never appears after invoice reload — managers who don’t re-extract won’t see it.
- **73% of findings (38/40)** are matching-only; managers may undervalue the feature until operational/math copy improves.
- Four extraction codes never exercised on VL — confidence in those paths is test-only.

---

## Highest Priority Improvements (max 5)

1. **Fix operational evidence presentation** — show €/kg as price not weight; format pack structure as “7 × 1.5 kg”; hide `check` slugs. Without this, Guanciale finding fails the “genuinely useful” bar despite correct detection.

2. **Rewrite operational + math owner copy** — replace “operational mismatch”, “normalization”, “reconcile”, “inconsistency” with “price per kg doesn’t match how we read the pack size” / “quantity × price doesn’t match line total (€X off)”.

3. **Persist or rehydrate OCR qty metadata** — so `OCR_QUANTITY_MISMATCH` survives invoice reopen; otherwise the rule is dead on arrival for managers.

4. **Deduplicate / differentiate dual math badges** — `MATHEMATICAL_RECONCILIATION_FAILURE` (warning) + `MATHEMATICAL_INCONSISTENCY` (error) on same row would confuse owners; unify copy or suppress warning when error fires.

5. **Surface economics findings more prominently** — matching findings dominate VL; consider separating “Invoice math & pack review” from “Ingredient linking” in UI so managers see Guanciale/Aceto-class issues first.

---

## Artifacts

| File | Contents |
|------|----------|
| `replay.mts` | Read-only Supabase + validation replay harness |
| `results.json` | Full per-row findings, known-problem cross-check, false-negative candidates |

---

## Return summary (parent agent)

- **Report path:** `.tmp/validation-findings-acceptance-test/REPORT.md`
- **Total findings reviewed:** 40 (52 invoice rows, 7 invoices)
- **False positive count:** 0
- **False negative count:** 2 (actionable)
- **Ship recommendation:** Yes with minor polish
- **Top 3 priority improvements:** (1) operational evidence €/kg display, (2) plain-language operational/math copy, (3) persist OCR qty metadata for reload
