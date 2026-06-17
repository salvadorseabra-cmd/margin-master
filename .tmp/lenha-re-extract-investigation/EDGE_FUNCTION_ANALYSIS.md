# Edge Function Analysis — Deployed vs Local

**Date:** 2026-06-15

## Deployed v32 (live invoke result)

```json
{
  "supplier": "Mais Lenhas & Carvão, Unipessoal, Lda.",
  "total": 75,
  "items": []
}
```

- `detectTableBounds`: `headerTop ≈ 621`, `top ≈ 585` — product row at y≈430 excluded
- Full-image fallback: **does not execute** (not in deployed code)
- `knownTotal` not passed to table extraction

## Local (uncommitted fix)

- Band-scan recovery: `headerTop: 360`, `top: 324` — product row included
- Full-image retry when `items.length === 0 && knownTotal > 0`
- Regression test passes locally
