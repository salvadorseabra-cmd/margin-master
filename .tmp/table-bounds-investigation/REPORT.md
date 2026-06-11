# Table Bounds Root Cause Investigation

**Date:** 2026-06-10 · **Read-only** · No production changes

## Algorithm trace (`detectTableBounds`)

Source: `supabase/functions/extract-invoice/invoice-image-crop.ts`

| Step | Constant / rule | Bocconcino value |
|------|-----------------|------------------|
| Scan band | `y ∈ [12%, 55%]` of image height | y ∈ [128, 590] on 1074px image |
| Header search | 18-row sliding window (`HEADER_BAND_ROWS`) | Window at winner y=571 spans rows 571–588 |
| Winner selection | **Minimum mean row luminance** across 18 rows | avg = **167.43** at y=571 |
| Header bottom refine | Extend while row luminance < `bestAvg + 12`, max 36px | headerBottom = 607 |
| Totals search | Edge peak in `[refinedBottom + 170, min(refinedBottom+350, 85%h)]` | totalsStart = 857 (edge=76.08) |
| Crop top | `headerTop - TOP_MARGIN` (10px) | **561** |
| Crop bottom | `totalsStart + 24` (or boundary padding) | **881** |

**Padding / geometry constants:** `TOP_MARGIN=10`, `HEADER_BAND_ROWS=18`, `MIN_TABLE_HEIGHT=170`, `bandThresholdDelta=12`, `TOTALS_BOTTOM_PADDING=24`, `SEARCH_BOUNDARY_SLACK=20`, `BOUNDARY_BOTTOM_PADDING=190`.

---

## Bocconcino deep-dive

| Metric | Value |
|--------|-------|
| detected headerTop | **571** |
| expected headerTop | **~453** (REFERÊNCIA/DESCRIÇÃO column-header row; best 18-row band in y∈[380,520] at y=454, avg=175.76) |
| delta (px) | **+118** (detected too low by 118px) |
| detected cropTop | **561** (cuts through Stracciatella row) |
| expected cropTop | **~443** (453 − 10) |
| exact heuristic responsible | **Global-minimum 18-row mean luminance** in scan band — no grey header bar on Bocconcino; Stracciatella metadata block (Lote/Data Validade, y≈581–587, luminance 151–164) pulls the winning window down to y=571 |

### What fooled the scanner?

1. **No grey shaded header.** Bocconcino uses plain black column labels (REFERÊNCIA, DESCRIÇÃO, …) on white paper. The heuristic was tuned for Aviludo/Bidfood grey bands (~160 luminance). The real header band averages **175.76** (rank #32) — 31 darker false bands exist above it.

2. **Multi-line product rows.** Mozzarella spans 3 text lines (name + Lote + Validade). Stracciatella has 2 lines. These create alternating light/dark row stripes in the product area.

3. **Stracciatella metadata tail (y≈581–587).** The winning 18-row window includes this block:

   | y | luminance |
   |---|-----------|
   | 581 | 164.91 |
   | 582 | 160.74 |
   | 583 | 159.38 |
   | 584 | 154.23 |
   | 585 | 154.54 |
   | 586 | 154.55 |
   | 587 | 151.13 |

   These 6 rows alone drag the window average to 167.43 — **8.3 points darker** than the true header at y=454.

4. **Certification text above table (y≈400–430).** `ZZ+Q - Processado por programa certificado…` and CIVA legal line add mid-grey rows that are still lighter than the Stracciatella metadata band.

5. **QR code / header clutter (y<400).** QR code and supplier block are outside the scan band bottom but keep upper scan positions lighter.

6. **Paper fold shadow.** Yellow crop line (y=561) aligns with a horizontal fold shadow through Stracciatella — contributes to local darkness but is not the primary winner driver (winner starts 10px below at 571).

### Candidate log (top 25 of 462 positions)

| rank | y | bandAverage | Δ from winner |
|------|---|-------------|---------------|
| 1 | **571** | **167.43** | 0 |
| 2 | 570 | 167.85 | 0.43 |
| 3 | 569 | 168.99 | 1.57 |
| 4 | 568 | 170.12 | 2.70 |
| 5 | 567 | 171.44 | 4.01 |
| 6 | 547 | 172.53 | 5.10 |
| 7 | 548 | 172.67 | 5.24 |
| 8 | 546 | 172.76 | 5.34 |
| 9 | 566 | 172.77 | 5.34 |
| 10 | 545 | 173.00 | 5.57 |
| 11 | 549 | 173.13 | 5.70 |
| 12 | 544 | 173.51 | 6.08 |
| 13 | 565 | 173.91 | 6.48 |
| 14 | 550 | 174.01 | 6.59 |
| 15 | 543 | 174.26 | 6.83 |
| 16 | 559 | 174.42 | 6.99 |
| 17 | 558 | 174.48 | 7.05 |
| 18 | 557 | 174.59 | 7.17 |
| 19 | 560 | 174.61 | 7.18 |
| 20 | 551 | 174.66 | 7.24 |
| 21 | 564 | 174.69 | 7.27 |
| 22 | 561 | 174.76 | 7.33 |
| 23 | 556 | 174.83 | 7.40 |
| 24 | 542 | 174.92 | 7.49 |
| 25 | 562 | 175.02 | 7.59 |
| **32** | **454** | **175.76** | **8.33** ← expected column header |

**Full 462-candidate log:** `.tmp/table-bounds-investigation/bocconcino-candidates.json`

**Band row luminance detail:** `.tmp/table-bounds-investigation/bocconcino-band-detail.json`

---

## Comparison table

| Invoice | Image size | detected headerTop | expected headerTop | delta (px) | rows lost? |
|---------|------------|-------------------|-------------------|------------|------------|
| **Bocconcino** | 752×1074 | 571 | ~453 | **+118** | **YES** (2 rows: Mozzarella, Stracciatella) |
| **Bidfood** | 920×1272 | 447 | ~447 (grey header row) | **0** | **no** (extraction PASS, total €292.70) |
| **Aviludo May** | 742×938 | 228 | 228 | **0** | **no** (8/8 rows, crop 218–448) |
| **Aviludo April** | 848×1200 | 194 | ~194 (synthetic fixture grey header) | **~0** | unknown (0-item extract failure unrelated to crop geometry) |

### Per-invoice notes

- **Bidfood:** Detection lands on the dark grey `Código/Qtd/Uni/Descrição` band (overlay confirms). `cropTop=437` is 10px above header — correct. This template matches the heuristic's design target.

- **Aviludo May:** Grey band at y=228 is the global minimum (rank #1, avg=160.67). Gold-standard case from `.tmp/vl-crop-compare/`.

- **Aviludo April:** Image is a synthetic PDF render (`Aviludo_Historico_2026_04_with_total.pdf.png`), not the phone scan. Detection at y=194 aligns with the fixture's grey header row (overlay). May-scan expected y=228 does **not** apply to this different raster.

---

## Safest fix option (design only)

**Recommended: earliest-plausible-header among top-K darkest bands**

Rationale: The failure mode is not "wrong scan range" but "wrong global minimum" when product-row metadata is darker than the real header. A minimal change:

1. Collect top-K (e.g. K=5) darkest 18-row bands in the scan window.
2. Pick the **earliest** (smallest y) candidate that is followed by ≥`MIN_TABLE_HEIGHT` px of relatively consistent row rhythm (low row-to-row luminance variance).
3. Fallback to current global-min behaviour for grey-header templates (Bidfood/Aviludo) where earliest top-K ≈ winner.

**Why not other options:**

| Approach | Risk |
|----------|------|
| Widen scan band only | Bocconcino winner is already inside band; widening doesn't help |
| Cap minimum `headerTop` at fixed px | Fragile across image scales (938px vs 1074px vs 1272px) |
| OCR anchor on "Referência"/"Descrição" | Accurate but adds latency + OCR dependency |
| Skip crop for unknown suppliers | Loses footer-exclusion benefit on good templates |

**Bocconcino-specific:** earliest top-5 candidate would be y=547 (rank #6, avg=172.53) — still too low. Need **row-regularity constraint** or **text-density valley** above product rows, not luminance alone. Consider detecting the horizontal rule above REFERÊNCIA (visible at y≈440 in `table-zone-400-650.png`) as a secondary anchor.

---

## Evidence paths

```
.tmp/table-bounds-investigation/
  detect-table-bounds-diagnostic.ts   # diagnostic runner
  comparison.json                     # machine-readable results
  REPORT.md                           # this file
  bocconcino-candidates.json          # all 462 scored positions
  bocconcino-band-detail.json         # per-row luminance in winner vs expected bands
  bocconcino-overlay.png              # yellow=cropTop, red=detected, green=expected, blue=bottom
  bidfood-candidates.json
  bidfood-band-detail.json
  bidfood-overlay.png
  aviludo-may-candidates.json
  aviludo-may-band-detail.json
  aviludo-may-overlay.png
  aviludo-april-candidates.json
  aviludo-april-band-detail.json
  aviludo-april-overlay.png
```

**Prior Bocconcino audit cross-reference:** `.tmp/bocconcino-investigation/` (`crop-bounds.json`, `table-zone-400-650.png`, `invoice-full.png`)
