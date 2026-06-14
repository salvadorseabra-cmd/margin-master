# Aviludo April — €169 Residual Error Audit

**Invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Deploy:** extract-invoice **v26** (correct PNG harness URL)  
**Mode:** READ-ONLY  
**Generated:** 2026-06-13

---

## Executive Summary

The **€169.08** error is **100% accounted for** by five rows where v26 sets **line total = unit price** instead of **qty × unit price**. Quantity and unit_price are correct on all 9 rows; only `line_total_net` fails — and only when **qty > 1**.

**Root cause:** Pass C column shift — `line_total_net` bleeds from `gross_unit_price` (VALOR column not read).

**Not a GT issue:** Refinement reextract on the same PNG fixture achieved **€0** error with all correct totals.

**Confidence:** 96%

---

## €169 Sum Check (100%)

| Rank | Product | GT total | v26 total | **€ delta** | % of €169 |
|------|---------|----------|-----------|-------------|-----------|
| 1 | Nata Reny Picot 6x1L | €91.45 | €18.29 | **€73.16** | 43.3% |
| 2 | Ovo Líquido Past.Gema | €61.14 | €10.19 | **€50.95** | 30.1% |
| 3 | Chocolate Pantagruel | €58.38 | €29.19 | **€29.19** | 17.3% |
| 4 | Filete Anchovas | €18.98 | €9.49 | **€9.49** | 5.6% |
| 5 | Atum Catrineta | €12.58 | €6.29 | **€6.29** | 3.7% |
| 6–9 | Mozzarella, Açúcar, Arroz, Pepinos | — | — | **€0** | 0% |
| | **Total** | | | **€169.08** | **100%** |

---

## Row Detail (all 9 rows)

### Wrong rows (qty > 1)

| Product | GT qty | v26 qty | GT unit | v26 unit | GT total | v26 total | Category |
|---------|--------|---------|---------|----------|----------|-----------|----------|
| Nata Reny Picot | 5 | 5 ✓ | €18.29 | €18.29 ✓ | €91.45 | **€18.29** | column_shift |
| Ovo Líquido | 6 | 6 ✓ | €10.19 | €10.19 ✓ | €61.14 | **€10.19** | column_shift |
| Chocolate | 2 | 2 ✓ | €29.19 | €29.19 ✓ | €58.38 | **€29.19** | column_shift |
| Filete Anchovas | 2 | 2 ✓ | €9.49 | €9.49 ✓ | €18.98 | **€9.49** | column_shift |
| Atum | 2 | 2 ✓ | €6.29 | €6.29 ✓ | €12.58 | **€6.29** | column_shift |

**Pattern:** `v26.total === v26.unit_price` for every multi-qty row. GPT copies Preço Unitário into VALOR.

### Correct rows (qty = 1)

| Product | GT total | v26 total | € delta |
|---------|----------|-----------|---------|
| Mozzarella Flor di Latte | €13.69 | €13.69 | €0 |
| Açúcar Branco | €9.29 | €9.29 | €0 |
| Arroz Agulha | €13.45 | €13.45 | €0 |
| Pepinos Extra II | €21.99 | €21.99 | €0 |

When qty=1, unit_price equals line total on the invoice — the bug is masked.

---

## Bug vs GT (per row)

| Row | Verdict |
|-----|---------|
| All 5 wrong rows | **Real extraction error** — refinement proved GT reachable |
| All 4 correct rows | Correct |
| GT mismatch? | **No** — refinement extract matches GT exactly |
| Gross vs net? | **No** — unit prices match GT |
| Quantity mismatch? | **No** — all qty MATCH |

---

## First Failing Stage

| Stage | Result |
|-------|--------|
| Visible invoice / harness | 9 rows, correct URL ✅ |
| Geometry / crop | Rows visible ✅ |
| **Pass C (GPT)** | **line_total_net wrong on 5 rows** ❌ |
| Binder | Passes through wrong total |
| Final API | Same wrong totals |

---

## Baseline Comparison

| Probe | Items | € error | Notes |
|-------|-------|---------|-------|
| Before c33 (post-audit) | 9 | **€169.08** | Same failure mode |
| Pass C refinement (Jun 11) | 9 | **€0** | All totals correct |
| v26 VL rerun (Jun 12) | 9 | **€169.08** | Harness fixed; totals regressed |

The €169 is a **recurring GPT failure mode** on this fixture, not introduced by the April harness fix or v26 Chocolate prompt. Single-run variance; refinement demonstrated fixability.

---

## Expected Improvement If Fixed

| Metric | Current | After fix |
|--------|---------|-----------|
| Aviludo April € error | €169.08 | **~€0** |
| Global v26 € error | €220.27 | **~€51** |
| April VL status | OPEN | **CLOSED** (field ~100%) |

---

## Recommended Fix (prompt only)

Add **line_total_net isolation** examples for Aviludo April multi-qty rows:

- **GOOD:** Ovo qty 6, gross 10.19, **line_total_net 61.14** (from VALOR)
- **BAD:** line_total_net **10.19** (= gross_unit_price)

Complements v26 Chocolate price-isolation rule (adjacent-row gross bleed) with total-column rule.

---

## Artifacts

| File | Contents |
|------|----------|
| `row-breakdown.json` | All 9 rows ranked by € contribution |
| `root-cause.json` | Verdict, mechanism, fix recommendation |
| `.tmp/final-validation-lab-rerun-v26/extracts/c2f52357-....json` | v26 extract |
| `.tmp/passc-refinement-validation/reextract/c2f52357-....json` | €0 baseline |
