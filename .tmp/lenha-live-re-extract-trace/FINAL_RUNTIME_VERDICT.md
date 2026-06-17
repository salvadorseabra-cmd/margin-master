# Final Runtime Verdict — Lenha Live Re-Extract

**Date:** 2026-06-15

## Runtime evidence summary

| # | Capture | Actual value |
|---|---------|--------------|
| 1 | Edge function version | **v32** (2026-06-14) — pre-fix |
| 2 | detectTableBounds | `headerTop: 621`, `top: 585`, `bottom: 918` |
| 3 | Crop coordinates | top=585, bottom=918; product row y≈430 excluded |
| 4 | Full-image fallback | **NO** |
| 5 | Raw GPT Pass D | **Not captured** (not in HTTP response; logs unavailable) |
| 6 | extractTableItemsFromImage | `{ items: [], total: 75, supplier: "Mais Lenhas & Carvão..." }` |
| 7 | normalizedItems.length | **0** |
| 8 | Abort stage | Edge Pass D crop → items=[]; client `runExtraction` L1417–1424 |

## Verdict

Re-extract fails because **production runs pre-fix v32**. Live invoke returns `items:[]` with correct metadata. Client correctly aborts at `normalizedItems.length === 0`.

**Not** normalization, persistence, or UI bug.

**User claim "fix was committed and deployed" contradicts runtime evidence:** deployed bundle is v32 from 2026-06-14; Lenha fix remains uncommitted locally.
