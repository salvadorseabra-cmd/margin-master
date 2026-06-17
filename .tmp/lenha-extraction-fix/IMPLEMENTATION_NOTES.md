# Implementation Notes — Lenha Extraction Fix

**Date:** 2026-06-15

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/extract-invoice/invoice-image-crop.ts` | Footer grey rejection + band-scan white header recovery |
| `supabase/functions/extract-invoice/invoice-crop-geometry.ts` | `TABLE_HEADER_BAND_SCAN_END_FRACTION = 0.42` |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | Empty-items + known-total → full-image retry |
| `supabase/functions/extract-invoice/index.ts` | Pass `footerFromPass.total` into table extraction |
| `supabase/functions/extract-invoice/invoice-image-crop.test.ts` | Lenha geometry regression test |

## Primary fix — reject footer-anchored grey bands

After existing grey/white header logic, if `headerTop ≥ height × FOOTER_GREY_HEADER_MAX_FRACTION (0.50)`:

1. Run `detectWhiteHeaderTopByBandScan` over the **middle table zone**  
   - start: `max(scanStart, height × 0.28)`  
   - end: `min(footerMaxY, height × 0.42)`  
2. Pick the `isWhiteHeaderBand` candidate with highest rule-above score (ties → uppermost y).

This avoids:

- Footer IVA grey band at y≈621 (above 50% height)
- Client-info false positives at y≈228 (below 28% band-scan start)
- IVA column-label false positives at y≈531 (above 42% band-scan end)

### Lenha crop after fix

```
headerTop: 360
top:       324
bottom:    794
```

Product row y≈430 is inside `[324, 794]`.

## Safety fallback — empty items with positive total

In `extractTableItemsFromImage(imageDataUrl, apiKey, knownTotal?)`:

When `items.length === 0` **and** `knownTotal > 0` **and** a non-full crop was used, retry Pass D once with `skipCrop: true` (full image). Logs `[invoice-ocr] table-pass-empty-retry`.

`index.ts` now passes `footerFromPass.total` so the gate has the Pass C total.

## Scope compliance

No schema, pricing, matching, canonical, or persistence changes — extraction pipeline only.
