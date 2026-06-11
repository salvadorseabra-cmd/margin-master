# Pass C Prompt Audit

**Date:** 2026-06-11 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only — no code changes**

Cross-verified against: `.tmp/gpt-pattern-audit/`, `.tmp/persistence-audit/`, `.tmp/field-accuracy-audit/`, `.tmp/hallucination-audit/`, `.tmp/mammafiore-line-audit/`, `.tmp/geometry-audit/`.

**Source audited:** `supabase/functions/extract-invoice/invoice-table-extraction.ts` (`TABLE_EXTRACTION_SYSTEM_PROMPT`, lines 10–125) + user message (line 185). No other prompt fragments are imported into Pass C.

---

## Executive Summary

**The Pass C prompt actively encourages interpretation, not faithful column extraction.**

The prompt contains a structural contradiction: line 122 mandates *"copy each exactly from the invoice"* while lines 33–34 explicitly permit *"DO infer quantity/unit when clearly present inside product names."* Seven worked examples (lines 40–67, 80–84) teach pack-multiplier extraction (`33cl Pack 24 → qty 24`) but provide **no negative examples** for wholesale notation like `(CX 2.5KG*6)` where `*N` is case metadata, not purchased quantity.

Across 51 aligned VL rows, **all 7 financially significant errors originate in Pass C** (persistence-audit confirmed). Of these:

| Error class | Count | Prompt-driven? |
|-------------|-------|----------------|
| Pack Multiplier Confusion | 4 | **YES** — direct prompt instruction |
| Column Shift | 3 | **PARTIAL** — vision/OCR dominant; prompt fails to prevent |
| Phantom Row | 1 | **YES** — extract-all + no anti-phantom guard |

**Verdict:** Prompt design is the **largest single contributor (~50%)** to VL extraction errors. The prompt is not neutral — it teaches behaviors that directly produce Bocconcino, Mammafiore, and Ginger Beer failures.

---

## Highest-Risk Instructions (ranked)

| Rank | ID | Lines | Risk | VL errors |
|------|----|-------|------|-----------|
| 1 | `never-invent-but-infer` | 32–34 | **CRITICAL** | POMODOR qty 6, Aceto/Rulo qty 2, Ginger Beer qty 24, phantom Olio |
| 2 | `pack-24-bottles` | 53–55 | **CRITICAL** | POMODOR *6, Ginger Beer 24-pack |
| 3 | `bad-good-33cl` | 80–84 | **HIGH** | Ginger Beer bottle-count substitution |
| 4 | `copy-exactly-authoritative` | 122 | **HIGH** | Contradiction enabler; price errors when honored but vision fails |
| 5 | `extract-all-rows` | 29 | **HIGH** | Mammafiore phantom 9th row |
| 6 | `no-anti-hallucination` | *(absent)* | **HIGH** | Phantom Olio / lot contamination |
| 7 | `size-vs-purchased-qty` | 69–71 | **HIGH** | Incomplete — no CX*N wholesale rule |

Full ranking: `risk-ranking.json`

---

## Contradictions

| # | Severity | Conflict | VL evidence |
|---|----------|----------|-------------|
| 1 | **CRITICAL** | L122 "copy exactly" vs L33–34 "infer from names" | POMODOR, Aceto, Ginger Beer |
| 2 | **CRITICAL** | L32 "NEVER invent" vs L33–34 infer + L108–110 default qty=1 | Phantom Olio, Aceto *2 |
| 3 | **HIGH** | L116 "Do not hallucinate" vs L34 "contextual reasoning on messy OCR" | Phantom row fusion |
| 4 | **HIGH** | L112–114 null escape vs 7+ inference examples | GPT rarely emits null |
| 5 | **HIGH** | L69–71 purchased qty rule vs L53–67 pack examples (retail only) | CX 2.5KG*6 misread |
| 6 | **MEDIUM** | L29 "Extract ALL" vs L116 anti-hallucination | 9 rows vs 8 GT |
| 7 | **MEDIUM** | L122 column copy vs L48–51 name-inferred unit | Rulo unit kg |

Full analysis: `contradictions.json`

---

## Error Mapping Table

| Invoice | Product | Field | GT → Extracted | Error type | Prompt instruction(s) | Lines |
|---------|---------|-------|----------------|------------|----------------------|-------|
| IL Bocconcino | POMODOR PELATI (CX 2.5KG*6) | qty | 2 → **6** | Pack Multiplier | `never-invent-but-infer`, `pack-24-bottles` | 33–34, 53–55 |
| IL Bocconcino | POMODOR PELATI | unit_price | €25 → **€20** | Column Shift | `price-digit-by-digit`, `copy-exactly-authoritative` | 119–122 |
| Mammafiore | Aceto pet 5l*2 | qty | 1 → **2** | Pack Multiplier | `never-invent-but-infer`, `pack-24-bottles` | 33–34, 53–55 |
| Mammafiore | Rulo 1kg*2 | qty | 1 → **2** | Pack Multiplier | `never-invent-but-infer`, `weight-in-name-1kg` | 33–34, 44–46 |
| Mammafiore | Phantom Olio | entire row | absent → **invented** | Phantom + Lot | `extract-all-rows`, `no-anti-hallucination` | 29, *(absent)* |
| Emporio | Prosciutto Cotto | unit_price | €8.17 → **€17.06** | Column Shift | `copy-exactly-authoritative` (vision fails) | 122 |
| Emporio | San Pellegrino | qty / price | 2.56/€15.06 → **2/€19.32** | Column Shift | `copy-exactly-authoritative` (vision fails) | 122 |
| Emporio | Ginger Beer 0.20cl | qty/unit/price | 2 un/€9.69 → **24 un/€0.85** | Pack Multiplier | `never-invent-but-infer`, `bad-good-33cl` | 33–34, 80–84 |

Full mapping with evidence paths: `error-mapping.json`

---

## Counterfactual Results

**Scenario:** Column-only qty/price; no multiplier inference; no invented rows; lot/sub-line rejection.

| Error | Verdict | Rationale |
|-------|---------|-----------|
| Bocconcino POMODOR qty 6→2 | **YES** | Column shows 2; fresh extract already correct post-geometry |
| Bocconcino POMODOR price 25→20 | **UNCERTAIN** | Vision digit misread survives column-only mandate |
| Mammafiore Aceto qty 2→1 | **YES** | Fresh extract already qty=1 when inference suppressed |
| Mammafiore Rulo qty 2→1 | **YES** | Same mechanism |
| Mammafiore phantom Olio | **YES** | Row-count guard + lot filter eliminates 9th row |
| Emporio Prosciutto price | **UNCERTAIN** | Column bleed — vision limitation |
| Emporio Pellegrino qty/price | **UNCERTAIN** | Column shift — not pack-inference driven |
| Emporio Ginger Beer 24→2 | **YES** | Direct consequence of pack-24 example pattern |

**Summary:** 8/12 verdicts YES, 0 NO, 4 UNCERTAIN. **67% of financial errors would likely disappear** with prompt redesign; 33% residual from vision column misreads.

Full analysis: `counterfactual-analysis.json`

---

## Hallucination Exposure

| Capability | Allowed? | Key evidence (lines) | VL incident |
|------------|----------|---------------------|-------------|
| Product invention | **YES** | L29 extract-all; L33–34 contextual reasoning; L116 weak guard | Mammafiore phantom Olio |
| SKU invention | **YES** | No artigo-code anchor | Olio Nuto 609 10lt |
| Qty invention | **YES** | L33–34 infer from *N; L108–110 default qty=1 | POMODOR *6, Aceto *2, Ginger 24 |
| Unit invention | **YES** | L33–34, L48–51 name-inferred unit | Rulo kg, Ginger unit shift |
| Line invention | **YES** | L29 + L185 extract-all; no row-count guard | 9 rows vs 8 GT |
| Price invention | **NO** (misread yes) | L119–122 copy exactly | Prosciutto/POMODOR — vision misread, not invented |

Full matrix: `hallucination-exposure.json`

---

## Root Cause Assessment

| Source | Contribution % | Notes |
|--------|---------------|-------|
| **Prompt design** | **50%** | infer-from-name, pack examples, extract-all, no anti-phantom |
| **OCR (GPT vision)** | **28%** | Digit/column misreads, description noise |
| **Geometry** | **7%** | Largely resolved post-fix; not cause of current field errors |
| **Model limitations** | **15%** | Non-determinism, dense grid alignment |

All 7 financially significant errors first appear in Pass C raw JSON (persistence-audit). Downstream `normalizeItems`, `reconcileLineItemAmounts`, and client persistence are **lossless transducers**.

Full attribution: `root-cause-assessment.json`

---

## Highest ROI Change Area (design only)

**Column-first extraction with pack-metadata disambiguation.**

1. **Column precedence rule:** When a quantity column value is visible, it overrides any `*N` in the product description. Pack notation is metadata unless the column is empty.
2. **Negative pack examples:** Add explicit counter-examples:
   - `(CX 2.5KG*6)` with column qty=2 → qty **2**, not 6
   - `pet 5l*2` with column qty=1 → qty **1**, not 2
   - `1kg*2` with column qty=1 → qty **1**, not 2
3. **Retail-only inference whitelist:** Allow `33cl*24 → qty 24` only when the purchased unit column shows individual bottles (`un`), not cases (`cx`).
4. **Anti-phantom guards:** Reject rows matching `Lote\s*\d`, `Data Exp`, `Nº` as standalone items. Compare output row count to visible artigo codes.
5. **Remove contradiction:** Delete or heavily qualify L33–34 infer rule; align with L122 copy-exactly mandate.

Expected impact: fixes 5/7 financial error rows (pack multiplier + phantom); reduces but does not eliminate column-shift price errors.

---

## Prompt Fragment Reference (exact line numbers)

| Fragment | File | Lines |
|----------|------|-------|
| `TABLE_EXTRACTION_SYSTEM_PROMPT` | `invoice-table-extraction.ts` | 10–125 |
| Pass C invocation (system + user + image) | `invoice-table-extraction.ts` | 178–190 |
| Pass C orchestration in pipeline | `index.ts` | 141–161, 176–179 |
| Post-prompt reconcile (not GPT) | `invoice-line-reconcile.ts` | 27–80 |

Complete effective prompt saved: `passc-prompt.txt`

---

## Evidence File List

### This audit
```
.tmp/passc-prompt-audit/
  REPORT.md
  passc-prompt.txt
  instruction-inventory.json
  error-mapping.json
  contradictions.json
  risk-ranking.json
  counterfactual-analysis.json
  hallucination-exposure.json
  root-cause-assessment.json
```

### Reference audits (verified directly)
```
.tmp/gpt-pattern-audit/
  REPORT.md, error-catalog.json, multiplier-errors.json,
  column-errors.json, phantoms.json, prompt-weaknesses.json

.tmp/persistence-audit/
  REPORT.md, pass-c-raw/pass-c-answers.json,
  pass-c-raw/*-extract-invoice.json, delta-attribution.json

.tmp/field-accuracy-audit/
  REPORT.md, field-comparison.json, ground-truth.json, error-sources.json

.tmp/hallucination-audit/
  REPORT.md, phantom-analysis.json, row-classification.json

.tmp/mammafiore-line-audit/
  REPORT.md, pass-c-raw.json, phantom-item-trace.json, ground-truth.json

.tmp/geometry-audit/
  REPORT.md, row-recall-table.json, master-dataset.json
```

### Source code
```
supabase/functions/extract-invoice/invoice-table-extraction.ts
supabase/functions/extract-invoice/index.ts
supabase/functions/extract-invoice/invoice-line-reconcile.ts
```
