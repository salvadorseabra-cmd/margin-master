# Final Summary — Lenha Extraction Fix

**Date:** 2026-06-15

## Problem

Single-line Lenha invoice (`342d930b-7784-45d9-8db9-43e2a29baf61`) extracted metadata and total (€75) but **zero line items** because Pass D crop anchored on the IVA summary grey band (y≈621) instead of the product table (y≈430).

## Fix (minimal, extraction-only)

1. **Primary:** When grey-band detection lands in the footer half of the page, recover the real header via white-band scan in the middle table zone (28%–42% of image height).
2. **Fallback:** If cropped Pass D returns `items: []` while Pass C reported `total > 0`, retry once with the full image.

## Lenha before / after

| Metric | Before | After |
|--------|--------|-------|
| `headerTop` | 621 (IVA band) | 360 (product table zone) |
| `top` | 585 | 324 |
| Product row y≈430 in crop? | ❌ | ✅ |
| Expected GPT items | `[]` | `"Lenha para pizzaria"` (1 M3, €75) |

## Confidence

**High** for crop geometry (reproduced on fixture, regression test passes, no regressions on 8 existing invoice layouts). **Medium-high** for end-to-end extraction — GPT not re-invoked locally, but the prior `items: []` was a direct consequence of an empty crop; fallback adds belt-and-suspenders when total > 0.

## Deploy

Redeploy `extract-invoice` edge function to pick up changes.
