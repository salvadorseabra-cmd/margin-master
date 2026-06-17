# Root Cause Confirmation — Lenha Extraction Failure

**Date:** 2026-06-15  
**Invoice ID:** `342d930b-7784-45d9-8db9-43e2a29baf61`  
**Image:** `730×1164` PNG (`Screenshot_2026-06-07_at_21.04.49.png`)

## Confirmed failure point

Pass D table crop (`cropTableRegionForLineItems` → `detectTableBounds`) — **not** OCR, GPT, parsing, filtering, or persistence.

## Footer-band detection mechanism

`detectTableBounds` scans y ∈ `[12%, 55%]` of image height for the **darkest 18-row grey band** (`detectGreyHeaderTop`). That band is treated as the column-header stripe.

On Lenha:

| Band | y (approx) | 18-row mean luminance | Role |
|------|------------|----------------------|------|
| Product table header | 400 | 188.3 | Correct anchor (white text-on-paper) |
| IVA summary header | 621 | **176.7** (darkest in scan) | **Incorrect winner** |

Because the IVA band is darker than the product header, `detectGreyHeaderTop` sets `headerTop=621`.

### Why white-header fallback did not save it

When `bestBandAverage ≥ 163` (grey threshold not met), the pipeline tries `detectWhiteHeaderTop` (horizontal rule + `isWhiteHeaderBand`). Lenha has **zero horizontal rules** above `HEADER_RULE_MIN_EDGE=28` in the scan zone, so both standard and expanded rule searches return `null`. The code kept the footer grey winner.

### Crop outcome (before fix)

```
headerTop: 621
top:       585  (= headerTop − TABLE_TOP_MARGIN)
bottom:    918
```

Product row at y≈430 is **above** `top=585` → cropped out → GPT correctly returns `items: []`.

## Live extraction corroboration

Prior re-extract (audit):

```json
{ "supplier": "Mais Lenhas & Carvão, Unipessoal, Lda.", "invoice_date": "2026-05-23", "total": 75, "items": [] }
```

Metadata passes (A/B/C) succeed; only Pass D line items fail.
