# Final Verdict — Lenha Still Failing After Fix

**Date:** 2026-06-15

## Root cause of continued failure

**The fix was never deployed (and is still uncommitted).** Re-extract hits deployed v32 with pre-fix crop logic. Not a different bug.

## Answers

1. **Deployed version:** Old (v32) — Lenha fix absent
2. **detectTableBounds:** `headerTop ≈ 621` on deployed; local fix would use ~360
3. **Full-image fallback:** Does not execute on deployed v32
4. **Raw items:** `[]` from live invoke
5. **normalizedItems.length:** 0
6. **Failure stage:** Edge function Pass D — not normalization, persistence, or UI

## Required actions (guidance only)

1. Commit the 5 modified `supabase/functions/extract-invoice/` files
2. Deploy: `supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd`
3. Verify v33+ and re-extract invoice `342d930b-7784-45d9-8db9-43e2a29baf61`
4. Optional: persist header metadata when items.length === 0
