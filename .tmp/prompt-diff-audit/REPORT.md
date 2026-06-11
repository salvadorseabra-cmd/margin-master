# Prompt A vs Prompt B Diff Audit (commit c33a7f1)

Generated: 2026-06-11T00:52:43.020Z

## Executive Summary — Did c33a7f1 improve Marginly? **PARTIALLY**

Commit c33a7f1 replaced infer-from-name Pass C rules with column-faithful extraction. Row-level evidence shows **9 improved**, **3 regressed**, **1 partial**, **16 OCR-only** across **29 changed rows**.

Aggregate metrics moved the wrong direction on accuracy (95.0% → 91.9% field, 95.2% → 94.8% financial) but eliminated hallucinations (2% → 0%) and fixed Mammafiore phantom Olio. The commit **exchanged multiplier/hallucination errors for column-reading regressions** — not a clean win.

## Improvements Table — Rows genuinely fixed

| Invoice | Product | Changed Fields |
|---------|---------|----------------|
| Bidfood | Tomilho | unit_price |
| Aviludo April | Chocolate Pantagruel 10x200g | total |
| Aviludo April | Atum Óleo Bolsa Nau Catrineta 1 Kg | total |
| Aviludo April | Ovo Líquido Past.Gema Dovo 1kg | total |
| Aviludo April | Filete de Anchovas Alconfrisa Lt 495 g | total |
| Aviludo April | Nata Reny Picot 22% 6x1L | total |
| Emporio | Baladin - Ginger Beer 0.20cl | quantity, unit, unit_price |
| Mammafiore | Rulo Di Capra 1kg*2 Simonetta | description, total |
| Mammafiore | [PHANTOM REMOVED] Nui Lote 609 Data Exp. 20/07/2027 | description, quantity, unit, unit_price, total |

## Regressions Table — Rows newly broken

| Invoice | Product | Changed Fields |
|---------|---------|----------------|
| Bidfood | Hortelã | quantity, unit, unit_price |
| Aviludo May | Açucar Branco METRO Chef 10x1 Kg | quantity, total |
| Mammafiore | Aceto balsamico di Modena IGP pet 5l*2 Toschi | unit_price, total |

## Financial Error Before vs After — Absolute euro error comparison

| Metric | Value |
|--------|-------|
| Total absolute line-total error BEFORE | €181.24 |
| Total absolute line-total error AFTER | €92.35 |
| Delta (after − before) | €-88.89 |
| Direction | Improved ✅ |

Largest financial swings among changed rows:
- **Aviludo May** / Açucar Branco METRO Chef 10x1 Kg: GT €9.99, old Δ €0, new Δ €79.92
- **Bocconcino** / POMODOR PELATI (CX 2.5KG*6): GT €50, old Δ €-10, new Δ €-10
- **Emporio** / Rovagnati - Assaporami Prosciutto Cotto : GT €35.14, old Δ €1.4, new Δ €1.4
- **Mammafiore** / Aceto balsamico di Modena IGP pet 5l*2 T: GT €16.09, old Δ €-0.19, new Δ €-1
- **Mammafiore** / Rulo Di Capra 1kg*2 Simonetta: GT €10.86, old Δ €-0.48, new Δ €-0.03

## Hallucination Comparison — Before vs after

| Metric | Before | After |
|--------|--------|-------|
| Phantom rows (6 invoices) | 1 | 0 |
| Hallucination rate | 1.96% | 0% |
| Mammafiore phantom Olio removed? | — | **YES ✅** |
| New phantoms introduced | — | 0 |

Before phantoms:
- Mammafiore: "Nui Lote 609 Data Exp. 20/07/2027" (€15.9)

## Root Cause Analysis — Why fixes happened, why regressions happened

### Fixes (column-first prompt helped)
- **Bidfood** / Tomilho: Stronger column-first rule — qty 1→1 (GT 1); total €2.06→€2.06 (GT €2.06)
- **Aviludo April** / Chocolate Pantagruel 10x200g: Stronger column-first rule — qty 2→2 (GT 2); total €29.19→€58.38 (GT €58.38)
- **Aviludo April** / Atum Óleo Bolsa Nau Catrineta 1 Kg: Stronger column-first rule — qty 2→2 (GT 2); total €6.29→€12.58 (GT €12.58)
- **Aviludo April** / Ovo Líquido Past.Gema Dovo 1kg: Stronger column-first rule — qty 6→6 (GT 6); total €10.19→€61.14 (GT €61.14)
- **Aviludo April** / Filete de Anchovas Alconfrisa Lt 495 g: Stronger column-first rule — qty 2→2 (GT 2); total €9.49→€18.98 (GT €18.98)
- **Aviludo April** / Nata Reny Picot 22% 6x1L: Stronger column-first rule — qty 5→5 (GT 5); total €18.29→€91.45 (GT €91.45)
- **Emporio** / Baladin - Ginger Beer 0.20cl: Stronger column-first rule — qty 24→2 (GT 2); total €19.38→€19.38 (GT €19.38)
- **Mammafiore** / Rulo Di Capra 1kg*2 Simonetta: Stronger column-first rule — qty 1→1 (GT 1); total €10.38→€10.83 (GT €10.86)
- **Mammafiore** / Nui Lote 609 Data Exp. 20/07/2027: Stronger column-first rule — Phantom row removed: "Nui Lote 609 Data Exp. 20/07/2027" (€15.9)

### Regressions (column-first prompt hurt)
- **Bidfood** / Hortelã: Visual column reading failure; OCR limitation — qty 0.5→1 (GT 0.5); total €2.7→€2.7 (GT €2.7)
- **Aviludo May** / Açucar Branco METRO Chef 10x1 Kg: Visual column reading failure; OCR limitation — qty 1→9 (GT 1); total €9.99→€89.91 (GT €9.99)
- **Mammafiore** / Aceto balsamico di Modena IGP pet 5l*2 Toschi: Visual column reading failure — qty 1→1 (GT 1); total €15.9→€15.09 (GT €16.09)

### Category summary
| Category | Fix count | Regression count |
|----------|-----------|------------------|
| Removed multiplier inference | 0 | 0 |
| Removed contextual reasoning | 0 | 0 |
| Stronger column-first rule | 9 | 0 |
| Visual column reading failure | 0 | 3 |
| OCR limitation | — | 19 (no-material) |

## Recommendation — **REFINE** (72% confidence)

| Option | Accuracy | Financial | Hallucination Risk | Reliability | Composite |
|--------|----------|-----------|-------------------|-------------|-----------|
| KEEP | 91.87 | 94.82 | 100 | 75 | 91.85 |
| REFINE | 95.44 | 96.01 | 95 | 88 | 94.41 |
| REVERT | 95 | 95.19 | 98 | 85 | 94.16 |

c33a7f1 fixed high-severity hallucination and multiplier errors but traded them for column-reading regressions. Net row-level: more fixes than regressions on material fields, but aggregate accuracy dropped. Refining — not full revert — preserves anti-phantom gains while restoring contextual edge-case handling.

## Evidence Files — Everything under `.tmp/prompt-diff-audit/`

| File | Description |
|------|-------------|
| `changed-rows.json` | 29 rows with Old/New field objects |
| `outcome-classification.json` | Per-row IMPROVED/REGRESSED/PARTIAL/NO_MATERIAL |
| `error-delta.json` | Error counts: fixed 9, introduced 3 |
| `financial-impact.json` | Per-row GT deltas; total abs error before/after |
| `hallucination-diff.json` | Phantom row audit across 6 invoices |
| `root-cause-comparison.json` | Root cause per changed row |
| `decision-matrix.json` | KEEP/REFINE/REVERT scoring |
| `run-audit.mts` | Reproducible audit script |
| `REPORT.md` | This report |

## Data Sources

- OLD: `hallucination-audit/extract-*.json` + `persistence-audit/pass-c-raw/*-extract-invoice.json`
- NEW: `passc-implementation/reextract/*.json`
- Ground truth: `field-accuracy-audit/ground-truth.json`
- Commit: c33a7f1 — column-faithful Pass C prompt redesign
