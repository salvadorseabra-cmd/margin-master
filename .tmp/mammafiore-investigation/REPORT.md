# Mammafiore 0 Items Extraction Failure — Investigation Report

**Invoice:** Mammafiore Portugal · 2026-05-19 · €415.96  
**VL project:** bjhnlrgodcqoyzddbpbd  
**Investigation date:** 2026-06-10

## Summary

**Root cause:** Table crop top at y=622 excludes all 8 line-item rows; Pass C GPT receives only the footer totals band and returns 0 items.

## Invoice identity

| Field | Value |
|-------|-------|
| ID | `36c99d19-6f9f-413f-8c2d-ae3526291a2d` |
| Supplier | Mammafiore Portugal |
| Date | 2026-05-19 |
| Total | €415.96 |
| Storage path | `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781124591362-Screenshot_2026-06-07_at_21.05.02.png` |
| Full image size | 742 × 1184 px |

## DB state

| Metric | Value |
|--------|-------|
| `invoice_items` count | **0** |
| UI item count | **0** |
| UI total | €415.96 ✅ |

**Verdict:** DB has 0 rows — not a UI filtering issue. `shouldRejectInvoiceIngredientRow` never runs because nothing was persisted.

## Pass C result

Re-invoked `extract-invoice` on VL against storage image:

```json
{
  "supplier": "Mammafiore Portugal, Unipessoal Lda",
  "invoice_date": "2026-05-19",
  "total": 415.96,
  "items": []
}
```

- Pass C item count: **0**
- Footer pass (total): **415.96** ✅
- Supplier/date passes: correct ✅

## Table crop result

```
Full image:      742 × 1184 px
Detected bounds: top=622, bottom=890, headerTop=632, headerBottom=668, totalsStart=866
Crop height:     268 px
```

| Question | Answer |
|----------|--------|
| All 8 rows in crop? | **No** — all rows are above y=622 |
| Crop empty? | **No** — contains footer text + Mercadoria/Serviços 493,81 |
| Crop too low? | **Yes** — crop starts at bottom of item table |
| Crop too early/high? | No |

**Evidence:**
- `region-above-crop-top.png` (y=0–622): all 8 product rows + column headers visible
- `table-crop.png` (y=622–890): only footer fine-print + Mercadoria/Serviços subtotal box
- `overlay.png`: red line (crop top) sits at bottom edge of item table, ~250 px below real headers

### Header detection diagnostic

```
scanRange:              y=142–651 (12%–55% of image)
whiteHeaderSearchStart: y=449 (38% of image — WHITE_HEADER_MIN_RULE_FRACTION)
greyDetection:          darkest band at y=632, avg luminance 176.51 → triggers white path
rulesInWhiteSearchZone: [] (no horizontal rules ≥28 edge score found above y=449)
real column headers:    y≈370 (Artigo / Descrição / Qtd. / …)
```

White-header path activated (`bestBandAverage ≥ 163`) but found **no qualifying rules** in the restricted search zone (y ≥ 449). Real headers at y≈370 are **excluded** by `WHITE_HEADER_MIN_RULE_FRACTION=0.38`. Grey fallback selected the darkest band at y=632 — a footer/summary stripe, not the table header.

## OCR ground truth

Row bands cropped from the **correct** table region (above crop top), OCR'd via Pass C:

| Band | y range | Items extracted | Key text |
|------|---------|-----------------|----------|
| First | ~395 | 1 | Farina Speciale pizza 25kg Amoruso (€26.52) — also Guanciale visible in crop |
| Middle | ~520 | 2 | Rulo Di Capra 1kg (€10.86), Recargo por combustible (€2.00) |
| Last | ~655 | 0 | Band sits at table/footer boundary |

**Conclusion:** Line items are clearly readable when cropped correctly. Failure is purely crop placement, not OCR/GPT inability.

## Stage analysis

| Stage | Result | Evidence |
|-------|--------|----------|
| **Full invoice** | ✅ All 8 rows visible | `invoice-full.png`, `region-above-crop-top.png` |
| **Table crop** | ❌ **All rows excluded** | `table-crop.png` shows footer only; bounds top=622 |
| **OCR (correct region)** | ✅ Rows readable | `ocr-table.json`: Farina, Rulo, Recargo extracted from row bands |
| **GPT Pass C** | ❌ 0 items | `extract-invoice-response.json` — input crop has no line items |
| **normalizeItems** | N/A | No raw items to normalize |
| **reconcile** | N/A | `finalizeExtractedLineItems` receives empty array |
| **Persistence** | ❌ 0 rows | DB matches Pass C count |
| **UI** | ❌ 0 items shown | No hidden DB rows; not a filter issue |

## Root cause (proven)

1. `detectTableBounds` mis-anchors on this Mammafiore layout: white-header rule search starts at y=449, missing the real column header at y≈370.
2. With no white-header match, grey-band fallback picks y=632 (footer summary stripe — darkest band in scan range).
3. `cropTableRegionForLineItems` crops y=622–890 — entirely below the 8 product rows.
4. GPT Pass C faithfully returns 0 items from a footer-only image.
5. 0 items persist to DB; UI shows 0.

## Comparison with Bocconcino

| Invoice | Rows expected | Rows extracted | Header style | Crop result |
|---------|---------------|----------------|--------------|-------------|
| **Bocconcino** | 7 | 5 | White (Referência/Descrição) | **Too high** — top 2 rows cropped out (crop top y=561) |
| **Mammafiore** | 8 | 0 | White (Artigo/Descrição) | **Too low** — all 8 rows cropped out (crop top y=622) |

**Same family?** Yes — both are Primavera/BSS-style Portuguese invoices with white-background column headers and multi-line product rows (lot/expiry sub-lines).

**Different root cause?** Same underlying bug (`detectTableBounds` header mis-detection), opposite symptom:
- Bocconcino: grey band detected too low → crop starts mid-table → partial extraction (5/7)
- Mammafiore: white-header search zone too restrictive + no rules found → grey fallback picks footer band → total extraction failure (0/8)

**Did white-header fix (3b089b9) handle this?** **No.** Fix is deployed on VL (same 0-item result on re-extract). For Mammafiore:
- White path triggers but `WHITE_HEADER_MIN_RULE_FRACTION=0.38` excludes the real header at y≈370
- No horizontal rules pass `HEADER_RULE_MIN_EDGE=28` in the y≥449 search zone
- Falls back to grey darkest-band at y=632 (worse than Bocconcino's y=571 — entire table missed)

## Recommended fix (DESIGN ONLY)

1. **Lower `WHITE_HEADER_MIN_RULE_FRACTION`** from 0.38 → ~0.28 so white-header rule search includes headers at y≈30–32% of page height (covers Mammafiore y=370/1184=31%).
2. **Reject footer-anchored grey bands:** if detected `headerTop` > 50% of image height AND no column-header text patterns expected in crop, fall back to scanning upper scan range or use first strong horizontal rule below client-info block.
3. **Crop validation gate:** after crop, if Pass C returns 0 items but footer pass found a non-zero total, retry with expanded top (e.g. `top = scanStart`) before persisting.
4. **Regression fixtures:** add Mammafiore + Bocconcino PNGs to `invoice-image-crop.test.ts` asserting crop top < 450 for both.

## Evidence artifacts

```
.tmp/mammafiore-investigation/
  invoice-full.png              # Full invoice from storage (742×1184)
  invoice-meta.json             # DB invoice record + 0 items
  invoice-dataurl.txt           # Base64 data URL for re-extract
  crop-bounds.json              # detectTableBounds output + diagnostic
  header-diagnostic.json        # Grey/white path analysis
  table-crop.png                # What Pass C sees (footer only)
  table-crop-top400.png         # Top of mis-cropped region
  region-above-crop-top.png     # y=0–622: all 8 rows + headers
  table-zone-320-520.png        # Real header + first rows
  overlay.png                   # Bounds overlay (red=crop top at y=622)
  ocr-row-first.png             # Ground truth row band
  ocr-row-middle.png
  ocr-row-last.png
  ocr-table.json                # Pass C on correct row bands
  extract-invoice-response.json # Full pipeline re-extract (0 items)
  summary.json                  # Investigation summary
  probe.mts                     # Investigation runner
  header-diagnostic.ts          # Header path diagnostic
  crop-local.ts                 # Crop artifact generator
  REPORT.md                     # This report
```
