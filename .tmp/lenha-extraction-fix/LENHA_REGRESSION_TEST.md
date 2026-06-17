# Lenha Regression Test

**Date:** 2026-06-15

## Fixture

Downloaded from Supabase storage to:

`.tmp/lenha-extraction-fix/invoice-full.png`

Source path: `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781560191470-Screenshot_2026-06-07_at_21.04.49.png`

## Test added

`supabase/functions/extract-invoice/invoice-image-crop.test.ts`:

```
detectTableBounds: Lenha includes product row, not IVA band y=621
```

### Assertions

| Check | Before fix | After fix |
|-------|------------|-----------|
| `headerTop < 621` | ❌ (621) | ✅ (360) |
| `top < 430` (product row) | ❌ (585) | ✅ (324) |
| `bottom > 430` | ✅ (918) | ✅ (794) |

## Ground truth (manual on full PNG)

One line item: **Lenha para pizzaria**, 1,00 M3, €75,00.

## GPT extraction note

Local `OPENAI_API_KEY` not configured; end-to-end Pass D not re-run here. Crop geometry fix is the proven blocker — with the corrected crop, GPT receives the product row. Full-image fallback covers any remaining crop edge cases when `total > 0`.
