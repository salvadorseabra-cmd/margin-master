# Deployment Proof — Live Re-Extract

**Date:** 2026-06-15  
**Invoice:** `342d930b-7784-45d9-8db9-43e2a29baf61`

| Field | Value |
|-------|-------|
| Project | `bjhnlrgodcqoyzddbpbd` (marginly-validation-lab) |
| Function | `extract-invoice` **v32** ACTIVE |
| Last deploy | **2026-06-14 16:13:36 UTC** |
| Commit | **`9dbc591`** — OCR determinism only |
| SHA256 | `310f7f50135a40e5b4679fce922f56e7b0b37f0e26e38f75da543d7497b47f7b` |

## Lenha fix status

| Location | Status |
|----------|--------|
| Deployed v32 bundle | **Absent** — no `detectWhiteHeaderTopByBandScan`, no full-image retry |
| Workspace | **Present, uncommitted** (5 modified extract-invoice files) |

**Evidence:** `supabase functions list`, Management API metadata, `supabase functions download --use-api`.
