# Crop Geometry Runtime — Lenha

**Date:** 2026-06-15  
**Image:** 730×1164 (live storage PNG, same bytes as invoke)

## detectTableBounds (deployed v32 replay)

```json
{
  "headerTop": 621,
  "top": 585,
  "bottom": 918,
  "headerBottom": 657,
  "totalsStart": 894,
  "detected": true
}
```

## Crop coordinates

- **top:** 585
- **bottom:** 918
- **width:** 730px (full width)
- **Product row:** y≈430 — **excluded**

## Local fix (uncommitted) would yield

```json
{
  "headerTop": 360,
  "top": 324,
  "bottom": 794
}
```

## Full-image fallback

**NO** — deployed code has no `knownTotal`, no `table-pass-empty-retry`, no `skipCrop` retry.

## Log markers

| Marker | Found? |
|--------|--------|
| `table-crop-result` | No — edge console not exposed via API |
| `table-pass-empty-retry` | N/A — absent from deployed code |
| `detectWhiteHeaderTopByBandScan` | N/A — absent from deployed v32 |
