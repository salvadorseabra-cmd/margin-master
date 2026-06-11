# Validation Lab Hallucination Audit

**Date:** 2026-06-10 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only**

Post Mammafiore geometry fix commit `2edcd02`. Focus: **GPT table extraction reliability** (not geometry unless proven).

---

## Executive Summary

| Metric | Value |
|--------|-------|
| VL invoices audited | **6** |
| **Row recall** (real rows / expected) | **100.0%** |
| **Accuracy** (strict MATCH / expected) | **83.0%** |
| **Hallucination rate** (phantoms / extracted) | **2.0%** |
| Total phantom rows | **1** |
| Total missing rows (unresolved) | **0** |

---

## Invoice Ranking (best → worst)

| Rank | Invoice | Row Recall | Accuracy | Hallucination Rate | Notes |
|------|---------|------------|----------|-------------------|-------|
| 1 | Bidfood Portugal | 100.0% | 100.0% | 0.0% | 0 phantoms |
| 2 | Emporio Italia | 100.0% | 100.0% | 0.0% | 0 phantoms |
| 3 | IL Bocconcino | 100.0% | 100.0% | 0.0% | 0 phantoms |
| 4 | Aviludo May | 100.0% | 88.0% | 0.0% | 0 phantoms |
| 5 | Mammafiore | 100.0% | 63.0% | 11.0% | 1 phantoms |
| 6 | Aviludo April | 100.0% | 44.0% | 0.0% | 0 phantoms |

---

## Phantom Rows Found

| Invoice | Phantom Row (Pass C) | Persisted (DB) | First Appearance | Cause |
|---------|----------------------|----------------|------------------|-------|
| Mammafiore | Olio Nute 600g Dea | Olio Nuto 609 10lt (€18.30) | GPT (Pass C raw JSON) | GPT |

---

## Missing Rows Found

| Invoice | Missing Row | Cause | Notes |
|---------|-------------|-------|-------|
| — | — | — | — |

---

## Root Cause Distribution

| Cause | Count | Notes |
|-------|-------|-------|
| Geometry | 0 | Pre-fix Bocconcino crop; resolved post 2edcd02 |
| OCR | 0 | No separate OCR stage |
| GPT | 10 | Phantoms + partial field errors |
| Normalization | 0 | — |
| Persistence | 0 | No row invention observed |

---

## Most Important Discovery

**Mammafiore phantom row is ISOLATED — not a systemic VL hallucination epidemic.**

Evidence:
1. **Only 1 phantom row** across all 6 VL invoices (1 total).
2. Phantom `Olio Nuto/Noc/Nute` **does not exist on source invoice** — proven in `.tmp/mammafiore-line-audit/`.
3. **First appearance: GPT Pass C raw JSON** before `normalizeItems` — downstream stages preserve row count only.
4. Other invoices: **row counts match expected** (Bidfood 11/11, Aviludo May 8/8, Aviludo April 9/9, Bocconcino 7/7 post-fix, Emporio 8/8).
5. Remaining issues are **field-level PARTIAL** (qty/unit/price OCR-style errors), not invented rows — e.g. Aviludo May anchovas label, Aviludo April qty drift on re-extract vs DB.
6. **Bocconcino geometry fix verified:** 7/7 rows in DB post `2edcd02` (was 5/7 pre-fix due to crop, not GPT).

**Systemic GPT quality concern:** field fidelity and non-determinism (partial rows, label variants) — **not** row invention at scale.

---

## Recommendation (design only)

1. **Phantom gate:** Reject Pass C rows with no matching Artigo code / visible product name on crop (Mammafiore pattern).
2. **Row-count sanity check:** Compare GPT row count vs deterministic article-code count in crop; flag N≠expected.
3. **Prompt hardening:** Explicit anti-hallucination rule for lot numbers and sub-lines (Nº Lote).
4. **Regression fixture:** Mammafiore PNG → assert exactly 8 items, `/Olio/i` absent.
5. **Do not over-index on geometry** for hallucination — geometry fix unlocked Mammafiore extraction; phantom is GPT-origin.

---

## Evidence Files

```
.tmp/hallucination-audit/
  run-audit.mts
  ground-truth.json
  extracted-dataset.json
  row-classification.json
  phantom-analysis.json
  missing-analysis.json
  reliability-score.json
  root-cause-distribution.json
  extract-*.json
  REPORT.md

Cross-reference:
  .tmp/mammafiore-line-audit/
  .tmp/mammafiore-investigation/
  .tmp/geometry-audit/
  .tmp/bocconcino-investigation/
  .tmp/emporio-footer-audit/
  .tmp/ginger-beer-audit/
```
