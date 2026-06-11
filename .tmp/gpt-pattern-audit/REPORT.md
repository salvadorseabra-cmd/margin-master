# GPT Table Extraction Failure Pattern Audit

**Date:** 2026-06-10 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only**

Cross-verified against: `.tmp/persistence-audit/`, `.tmp/field-accuracy-audit/`, `.tmp/hallucination-audit/`, `.tmp/mammafiore-line-audit/`, `.tmp/geometry-audit/`.

---

## Executive Summary

Across 6 Validation Lab invoices (51 aligned rows), **14 rows fail perfect-match** (72.5% row accuracy). All financially significant errors **originate in GPT Pass C** — persistence/reconcile do not corrupt values (persistence-audit confirmed).

**Top failure patterns by frequency:**

1. **OCR Character Noise** (8 classifications)
2. **Pack Multiplier Confusion** (4 classifications)
3. **Column Shift** (3 classifications)
4. **Phantom Row** (1 classifications)
5. **Lot Number Contamination** (1 classifications)

**Root cause:** The Pass C prompt explicitly instructs GPT to *infer quantity/unit from product names* (pack notation like `*6`, `5l*2`, `33cl*24`) without distinguishing **pack metadata** from **purchased quantity column**. Combined with no row-count guard and permissive "extract ALL items" wording, this produces pack-multiplier confusion (4 rows), column misreads (3 rows), phantom/lot hallucinations (1 invoice), and OCR-only noise (8 description rows).

**Highest-ROI improvement (design only):** Split Pass C into column-faithful extraction + deterministic pack-parser — read qty/unit_price/total strictly from columns; treat `(CX 2.5KG*6)`, `pet 5l*2`, `1kg*2` as description metadata unless a dedicated pack-qty rule matches with column confirmation.

---

## Error Frequency Table

| Error Type | Count |
|------------|-------|
| OCR Character Noise | 8 |
| Pack Multiplier Confusion | 4 |
| Column Shift | 3 |
| Phantom Row | 1 |
| Lot Number Contamination | 1 |

*Note: Rows may carry multiple error types; OCR Character Noise (description-only) is non-financial.*

---

## Error Catalog Summary

15 non-perfect-match rows catalogued in `error-catalog.json`. Financial errors concentrate on 3 invoices:

| Invoice | Error rows | Dominant pattern |
|---------|-----------|------------------|
| Emporio Italia | 3 | Column Shift + Pack Multiplier |
| Mammafiore | 4 | Pack Multiplier + Phantom Row |
| IL Bocconcino | 2 | Pack Multiplier + Column Shift |
| Aviludo May | 4 | OCR Character Noise only |
| Bidfood / Aviludo April | 0 financial | — |

---

## Phantom Row Analysis

One confirmed phantom across the corpus (**Mammafiore**):

- **Not visible** on source invoice or table crop (geometry-audit: 8/8 real rows detected)
- **Not from OCR** (vision-only pipeline)
- **First appears in Pass C raw JSON** as `Olio Noc 609 Della O.P.` (€18.83)
- **Fresh extract** relabels phantom as `Nui Lote 609 Data Exp. 20/07/2027` — lot metadata misread as product
- **Persisted** to DB as `Olio Nuto 609 10lt` (earlier run, stale)
- **Mechanism:** GPT fused Birra Peroni lot `6009`, Aceto `pet 5l*2` (10L volume cue), and adjacent numerics into a phantom olive-oil SKU

See `phantoms.json` and `.tmp/mammafiore-line-audit/phantom-item-trace.json`.

---

## Column Shift Analysis

Three financial column-misread cases:

1. **Emporio Prosciutto** — unit_price €8.17 → €17.06 (+108%). Likely bleed from weight range `4-4,25KG` or wrong PREÇO UNITÁRIO column digit.
2. **Emporio San Pellegrino** — qty 2.56→2, unit_price €15.06→€19.32 while total ~matches. Wrong price column with arithmetic masking.
3. **Bocconcino POMODOR** (fresh run) — qty correct (2) but unit_price €25→€20, total €50→€40. Price column misread after postfix qty confusion fixed.

See `column-errors.json`.

---

## Pack Multiplier Analysis

Systematic `*N` / `xN` misinterpretation when pack spec appears in description:

- **POMODOR PELATI (CX 2.5KG*6)**: postfix pass-c-raw used *6 as purchased qty
- **Aceto balsamico pet 5l*2 Toschi**: pass-c-raw: *2 interpreted as qty=2; fresh extract corrected to qty=1
- **Rulo Di Capra 1kg*2 Simonetta**: pass-c-raw: *2 interpreted as qty=2
- **Baladin Ginger Beer 0.20cl**: Fresh extract: bottle count substituted for case count

**Counter-example (correct):** Birra Peroni `33cl*24` → qty 24 matches GT because purchased unit is individual bottles and prompt teaches this pattern.

See `multiplier-errors.json`.

---

## Hallucination Risk Score per Invoice

| Invoice | GPT Errors | Error Types | Risk Score |
|---------|-----------|-------------|------------|
| Emporio Italia | 3 | OCR Character Noise, Column Shift, Pack Multiplier Confusion | 85 |
| Mammafiore | 3 | Pack Multiplier Confusion, OCR Character Noise, Phantom Row, Lot Number Contamination | 78 |
| IL Bocconcino | 1 | Pack Multiplier Confusion, Column Shift, OCR Character Noise | 55 |
| Aviludo May | 0 | OCR Character Noise | 12 |
| Bidfood Portugal | 0 | — | 0 |
| Aviludo April | 0 | — | 0 |

*Risk score 0–100: financial GPT error density + phantom penalty. Bidfood/Aviludo April = 0.*

---

## Prompt Weaknesses

Source: `supabase/functions/extract-invoice/invoice-table-extraction.ts` Pass C (`TABLE_EXTRACTION_SYSTEM_PROMPT`)

- **[HIGH] infer-from-name**: Explicit permission to infer qty/unit from pack notation (*2, *6, 33cl*24) — directly causes Aceto/Rulo/POMODOR/Ginger Beer errors
- **[HIGH] pack-examples**: Teaches bottle-count extraction but no rule for when pack spec is metadata vs purchased qty (CX 2.5KG*6 case qty=2 not 6)
- **[MEDIUM] no-row-count**: No upper bound or row-count validation — GPT adds phantom rows (Mammafiore Olio)
- **[MEDIUM] price-authoritative**: Contradicts infer-from-name rule; GPT still misreads columns (Prosciutto 8.17→17)
- **[MEDIUM] no-arithmetic-check**: Allows inconsistent triples — Ginger Beer 24×€0.85=€19.38 passes despite wrong semantics
- **[HIGH] no-anti-hallucination**: No instruction to reject lot numbers, footer rows, or sub-lines as separate items

Full analysis: `prompt-weaknesses.json`.

---

## Most Common Root Cause

**Pack Multiplier Confusion** driven by prompt rule *"DO infer quantity/unit when clearly present inside product names"* without column-validation or metadata-vs-purchase distinction. Secondary: **Column Shift** on dense Italian/Portuguese price grids where GPT reads neighbouring numeric fields.

---

## Highest ROI Improvement Area (Design Only)

1. **Column-first extraction pass** — mandate qty/unit_price/total from visible columns only; pack notation in description is metadata unless column qty is null.
2. **Row-count guard** — Pass B geometry provides row count; reject Pass C output with extra rows.
3. **Lot/sub-line filter** — reject rows matching `Lote\s*\d`, `Data Exp`, `Nº` as standalone items.
4. **Arithmetic sanity check** — flag when qty×unit_price ≠ total beyond tolerance AND unit semantics inconsistent (e.g., 24×€0.85 vs 2×€9.69).

---

## Evidence File List

| File | Purpose |
|------|---------|
| `.tmp/gpt-pattern-audit/error-catalog.json` | Full non-perfect-match catalog |
| `.tmp/gpt-pattern-audit/error-taxonomy.json` | Per-row error classifications |
| `.tmp/gpt-pattern-audit/frequency.json` | Error type counts |
| `.tmp/gpt-pattern-audit/phantoms.json` | Phantom row stage trace |
| `.tmp/gpt-pattern-audit/column-errors.json` | Financial column misreads |
| `.tmp/gpt-pattern-audit/multiplier-errors.json` | Pack notation cases |
| `.tmp/gpt-pattern-audit/risk-score.json` | Per-invoice risk |
| `.tmp/gpt-pattern-audit/prompt-weaknesses.json` | Pass C prompt gaps |
| `.tmp/persistence-audit/pass-c-raw/` | Fresh extract-invoice + gpt-raw cache |
| `.tmp/field-accuracy-audit/field-comparison.json` | Row alignment + field status |
| `.tmp/field-accuracy-audit/ground-truth.json` | Per-row GT |
| `.tmp/mammafiore-line-audit/phantom-item-trace.json` | Phantom stage evidence |
| `.tmp/hallucination-audit/phantom-analysis.json` | Cross-invoice phantom |
| `.tmp/persistence-audit/delta-attribution.json` | Pass C already wrong proof |
