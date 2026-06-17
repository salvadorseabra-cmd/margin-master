# Deployment Status — Lenha Fix

**Date:** 2026-06-15

| | Deployed (VL) | Local workspace |
|---|---|---|
| Function | `extract-invoice` **v32** on `bjhnlrgodcqoyzddbpbd` | Same 5 files modified, **uncommitted** |
| Last deploy | 2026-06-14 16:13:36 UTC | Fix written 2026-06-15, **never deployed** |
| Last commit | `9dbc591` — OCR hardening only | +142 lines: crop fix + full-image fallback |
| Lenha fix markers | **Absent** | **Present** in working tree |

Client calls **remote** Supabase (`VITE_SUPABASE_URL`), not local edge code. Deploy is manual: `supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd`.
