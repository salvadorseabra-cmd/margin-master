# OCR Quantity Prepass Forensics Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Gorgonzola:** `35bdf942-712b-46af-9f2e-666cb4744a88` · 2026-06-24

## Executive verdict

Qty pre-pass returned **integer OCR 2.00** while PDF Qtd shows **1,35**. Value **first appears at the prepass GPT vision call** — not in parsing or anchoring. Raw prepass JSON **not recoverable**; only `extraction_meta.ocr_quantity=2` from live v39 probe. **Root cause B:** description/pack-metadata override (`1/8` confusion class), not Qtd column faithful read.

## Final 5 questions

| # | Question | Answer |
|---|----------|--------|
| 1 | What returned 2.00? | `runQuantityPrePass` → GPT parsed `quantity: 2` |
| 2 | Raw prepass response available? | **NO** — only `ocr_quantity` in API meta |
| 3 | First stage with 2.00? | **Qty pre-pass model output** |
| 4 | Could 1/8 ~1,5kg become 2? | **Not arithmetically** — but model historically infers **qty=2** from description; prepass ignore rule failed |
| 5 | Controls correct? | **Prosciutto YES** (4.3); **Gorgonzola + Bresaola both prepass=2** (fraction-description rows); Mortadella 3.1≈3.11 |
| RC | Root cause | **B** — description/pack-metadata override |

## T1 — Architecture chain

1. extractTableItemsFromImage (invoice-table-extraction.ts:337)
1. runTableExtractionPass (L378)
1. cropTableRegionForLineItems (invoice-image-crop.ts:393)
1. runQuantityPrePass (invoice-qty-prepass.ts:165)
1. callOpenAiJson gpt-4.1 seed=42 (invoice-date-extraction.ts:54)
1. JSON parse items[].quantity (L190-198)
1. anchorQuantities (L447-448)
1. Pass C callOpenAiJson (L428-444)
1. bindMonetaryColumns → reconcile → extraction_meta

## T3 — Stage table (first appearance of 2.00)

| Stage | Qty | Source |
|-------|-----|--------|
| PDF Qtd column | 1.35 | Visible invoice / stage-trace.json |
| Geometry crop bounds | — | top 456 bottom 851 — row visible |
| Qty pre-pass GPT (first divergence) | 2 | extraction_meta.ocr_quantity live v39 |
| prepass parseMonetaryLineItems N/A | 2 | invoice-qty-prepass.ts L190-198 pass-through |
| Pass C structured | 1.05 | extraction_meta.pass_c_quantity |
| anchorQuantities out | 1.05 | scope gate skip — integer OCR |
| Persisted re-read | 1.05 | invoice_items DB |

## Required token table

| Token | Meaning | Could become 2.00? | Why |
|-------|---------|-------------------|-----|
| 1,35 | Printed Qtd column (purchased weight kg) | NO | Correct ground truth; prepass should emit 1.35 not 2 |
| 1/8 | Pack fraction in description (one-eighth wheel) | **YES** | Historical Gorgonzola failure mode: models infer integer case/piece count from fraction notation; prepass returned integer 2 |
| ~1,5kg | Nominal pack weight metadata in description | NO | Would yield 1.5 if misused, not 2; listed in prepass ignore rule L44 |
| 22,85 | Desc.(%) discount column value | NO | Discount percentage, not quantity; no path to integer 2 |
| 12,90 | Preço Unit gross €/kg | NO | Monetary column; prepass prompt excludes prices |
| 13,44 | Preço Total line VALOR | NO | Line total EUR; prepass excludes totals |
| 2 (integer) | No visible token on Gorgonzola row Qtd column | **YES** | Prepass output 2.00 is hallucinated/inferred — not copied from Qtd cell per visible invoice |
| GD87813 | Product code in description area | NO | Alphanumeric SKU; no qty semantics |

## T7 — Controls (live v39 prepass)

| Product | PDF Qty | Prepass OCR | Pass C | Prepass OK? |
|---------|---------|-------------|--------|-------------|
| gorgonzola | 1.35 | 2 | 1.05 | **NO** |
| prosciutto | 4.3 | 4.3 | 4.3 | YES |
| mortadella | 3.11 | 3.1 | 3.11 | **NO** |
| bresaola | 1.83 | 2 | 1.83 | **NO** |

**Pattern:** Integer prepass `2` clusters on Gorgonzola (`1/8`) and Bresaola (`1/2`) — both pack-fraction description rows. Prosciutto (no fraction token) reads correctly. Pass C overrides prepass on Bresaola/Mortadella; Gorgonzola fails scope gate (integer OCR).

## T2 — Live artifact recovery

| Artifact | Available? | Value |
|----------|------------|-------|
| Raw GPT prepass JSON | **NO** | Discarded after `JSON.parse` in `runQuantityPrePass` |
| Edge log `[invoice-ocr] qty-prepass-result` | Not queried | Logs parsed preview of first 3 rows only |
| `extraction_meta.ocr_quantity` (v39 live) | **YES** | Gorgonzola **2** |
| Re-read prepass snapshot | **NO** | No cached artifact from 12:19 UTC re-read |

## T4 — Prompt inspection

Prepass prompt (`invoice-qty-prepass.ts` L35-48) explicitly lists `1/8`, `~1,5kg` as **NOT** purchased quantity and mandates Qtd column trust. **1/8 does not arithmetically equal 2**, but the model returned integer **2** — matching the historical Gorgonzola description-confusion class (`gorgonzola-root-cause/root-cause.json`). Bresaola (`1/2 - 1,5kg`) received the same integer **2** on the same live probe, strengthening fraction-notation override as the mechanism.

## T6 — Prepass vs Pass C

| Row | Prepass OCR | Pass C | Final | Notes |
|-----|-------------|--------|-------|-------|
| Gorgonzola | **2** | 1.05 | 1.05 | Disagree; scope gate skips anchor |
| Prosciutto | 4.3 | 4.3 | 4.3 | Agree, PDF-correct |
| Bresaola | **2** | 1.83 | 1.83 | Prepass wrong; Pass C correct |
| Mortadella | 3.1 | 3.11 | 3.11 | Minor prepass slip |

Contrast: OCR-era pass-c-raw (pre-prepass) read Gorgonzola **1.35** correctly — prepass regression is a new failure mode on fraction-description rows.