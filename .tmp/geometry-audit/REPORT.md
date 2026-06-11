# Invoice Geometry Reliability Audit

**Date:** 2026-06-10 · **VL project:** `bjhnlrgodcqoyzddbpbd` · **Read-only**

## Executive Summary

| Metric | Value |
|--------|-------|
| VL invoices in DB | **6** |
| Mais Lenhas & Carvão | **Not present** in VL |
| Avg reliability score | **91.7%** |
| Row recall (OCR/table) success | **83%** (5/6 invoices full row recall) |
| Table geometry success | **83%** (5/6 invoices) |
| Footer total success | **100%** (6/6 invoices) |

**Current VL extraction reliability:** **5/6 invoices PASS** end-to-end (91.7% avg score). Grey-header templates (Bidfood, Aviludo May) are gold-standard. White-header **Bocconcino is now fixed** (header y=443, +13px delta, 7/7 rows). **Emporio footer fix deployed** (footer crop y=506 captures totals box). **Mammafiore remains the sole active table-geometry failure** (0/8 rows). Aviludo April DB is complete (9/9, €370.17) but storage is a PDF — geometry audit used local PNG fallback only.

**Biggest failure class:** **Class 2 — Header search too late (Mammafiore)** — only invoice with 0% row recall in production

**Second biggest:** **Class 4 — PDF storage** (Aviludo April) — production file not rasterizable; re-extract from storage would fail despite current DB data

---

## Invoice Ranking (best → worst)

| Rank | Invoice | Score | Rows | Footer | Status |
|------|---------|-------|------|--------|--------|
| 1 | Aviludo May | 100.0% | 100% | 100% | PASS |
| 2 | Aviludo April | 100.0% | 100% | 100% | PASS |
| 3 | Bidfood Portugal | 100.0% | 100% | 100% | PASS |
| 4 | IL Bocconcino | 100.0% | 100% | 100% | PASS |
| 5 | Emporio Italia | 100.0% | 100% | 100% | PASS |
| 6 | Mammafiore Portugal | 50.0% | 0% | 100% | FAIL |

---

## Master Dataset

| Invoice | Supplier | Image H×W | Header style | Table header Y | Detected header Y | Crop top | Crop bottom | Footer crop start | Rows exp/ext | Total exp/ext | Status |
|---------|----------|-----------|--------------|----------------|-------------------|----------|-------------|-------------------|--------------|---------------|--------|
| Aviludo May | Aviludo | 938×742 | A_grey_shaded | 228 | 228 | 218 | 448 | 448 | 8/8 | 330.42/330.42 | PASS |
| Aviludo April | AVILUDO | 1200×848 | A_grey_shaded | — | 194 | 184 | 439 | 540 | 9/9 | 370.17/370.17 | PASS |
| Bidfood Portugal | Bidfood Portugal | 1272×920 | A_grey_shaded | 447 | 447 | 437 | 1037 | 1037 | 11/11 | 292.7/292.7 | PASS |
| IL Bocconcino | IL BOCCONCINO Distribuição ALIMENTAR | 1074×752 | B_white_rule | 430 | 443 | 433 | 881 | 881 | 7/7 | 290.64/290.64 | PASS |
| Emporio Italia | Emporio Italia | 1124×724 | C_other | 466 | 466 | 456 | 851 | 506 | 8/8 | 327.46/327.46 | PASS |
| Mammafiore Portugal | Mammafiore Portugal | 1184×742 | B_white_rule | 370 | 632 | 622 | 890 | 890 | 8/0 | 415.96/415.96 | FAIL |

---

## Header Type Classification

| Class | Templates | Detection success | Avg row recall | Avg footer recall |
|-------|-----------|-------------------|----------------|-------------------|
| **A — Grey shaded** | Bidfood, Aviludo | 100% | 100% | 100% |
| **B — White + rule** | Bocconcino, Mammafiore | 50% | 50% | 100% |
| **C — Other** | Emporio Italia | 100% | 100% | 100% |

---

## Failure Classes (grouped)

### Class 1: Header too low (Bocconcino)

White-header invoice: grey-band fallback picks product metadata band below real column headers; crop top cuts off first rows.

**Invoices (0):** —

### Class 2: Header search too late (Mammafiore)

White-header search zone (≥38% height) excludes real headers; grey fallback picks footer summary band; all rows excluded.

**Invoices (1):** Mammafiore Portugal

### Class 3: Footer below totals (Emporio)

Table-anchored footer crop starts below grey Subtotal/Total box; GPT sees IVA/banking only.

**Invoices (0):** —

### Class 4: PDF storage (geometry N/A)

Storage file is PDF; imagescript cannot decode; geometry and OCR blocked.

**Invoices (1):** Aviludo April

### Class 5: Header mis-detection (other)

Grey-header or other template with >30px header delta without white-header pattern.

**Invoices (0):** —

---

## Failure Source per Invoice

| Invoice | Geometry class | Sources |
|---------|----------------|---------|
| Aviludo May | — | None |
| Aviludo April | Class 4: PDF storage (geometry N/A) | Table geometry, Footer geometry |
| Bidfood Portugal | — | None |
| IL Bocconcino | — | None |
| Emporio Italia | — | None |
| Mammafiore Portugal | Class 2: Header search too late (Mammafiore) | Table geometry |

---

## Recommended Next Fix (design only — highest ROI)

**Fix Mammafiore white-header table anchoring (Class 2) — Bocconcino fix pattern already works for sibling layout.**

Current code detects Bocconcino correctly (white-header path → headerTop y=443) but Mammafiore still fails because:
- Real column headers at y≈370 (31% of 1184px height)
- `WHITE_HEADER_MIN_RULE_FRACTION=0.38` excludes search below y=449
- No qualifying horizontal rules found → grey fallback picks footer band at y=632 → crop top y=622 excludes all 8 rows

1. **Lower `WHITE_HEADER_MIN_RULE_FRACTION`** from 0.38 → ~0.28 (covers Mammafiore y=370).
2. **Reject footer-anchored grey bands:** if `headerTop > 50% image height`, discard and re-scan upper band.
3. **Crop validation gate:** if Pass C returns 0 items but footer total is non-zero, retry with `top = scanStart` before persisting.

Expected impact: Mammafiore 0→8 rows. Bocconcino already PASS — no regression expected. Grey-header templates unchanged.

**Resolved (no action needed):**
- Bocconcino Class 1 — white-header rule detection now anchors at y=443 (was y=571 in prior audit)
- Emporio Class 3 — `detectSummaryTotalsBandTop` + fraction fallback → footerCropStartY=506, total €327.46 PASS

---

## Cross-reference: Prior Investigations

| Prior audit | Key finding used |
|-------------|------------------|
| `.tmp/table-bounds-investigation/` | Bocconcino header +118px too low (historical); grey-min heuristic failure mode |
| `.tmp/bocconcino-investigation/` | 7 expected rows; **prior** crop top y=561 cut Mozzarella/Stracciatella — **now fixed** (y=433, 7/7 in DB) |
| `.tmp/mammafiore-investigation/` | 0/8 rows; crop top y=622 below entire table |
| `.tmp/emporio-footer-audit/` | Footer crop y=851 misses totals box; fix uses summaryBandTop |
| `.tmp/emporio-footer-fix/` | Post-fix Emporio total 327.46 PASS |
| `.tmp/footer-validation-4dc40c3/` | Bidfood/Aviludo May footer PASS; April PDF blocked |
| `.tmp/ginger-beer-audit/` | Emporio normalization bug (separate from geometry) |

---

## Evidence

```
.tmp/geometry-audit/
  run-geometry-audit.mts       # Master audit runner
  geometry-deno.ts             # Local detectTableBounds + footer crop
  db-snapshot.json             # Raw VL DB query
  master-dataset.json          # Task 1
  header-classes.json          # Task 2
  row-recall-table.json        # Task 3
  footer-recall-table.json     # Task 4
  failure-classes.json         # Task 5
  failure-sources.json         # Task 6
  reliability-score.json       # Task 7
  images/                      # Downloaded invoice PNGs
  *-geometry.json              # Per-invoice geometry output
  REPORT.md                    # This file
```
