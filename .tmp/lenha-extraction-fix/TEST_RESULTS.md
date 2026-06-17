# Test Results — Lenha Extraction Fix

**Date:** 2026-06-15  
**Command:** `.tmp/deno/bin/deno test --allow-read=. --allow-net supabase/functions/extract-invoice/invoice-image-crop.test.ts supabase/functions/extract-invoice/invoice-monetary-binding.test.ts`

## invoice-image-crop.test.ts — 9/9 pass

| Test | Result |
|------|--------|
| Bidfood grey-header crop | ✅ |
| Aviludo May 8-row crop | ✅ |
| Mammafiore white header (not footer) | ✅ |
| Bocconcino white header (not footer) | ✅ |
| Emporio Italia column header | ✅ |
| Emporio footer crop totals box | ✅ |
| **Lenha product row included** | ✅ **new** |
| Bidfood footer crop anchored | ✅ |
| Aviludo footer crop anchored | ✅ |

## invoice-monetary-binding.test.ts — 7/7 pass

All existing monetary binding regressions unchanged.

## Summary

**16 passed, 0 failed**
