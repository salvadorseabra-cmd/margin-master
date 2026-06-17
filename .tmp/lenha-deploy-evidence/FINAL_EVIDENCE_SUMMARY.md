# Final Evidence Summary — Why Production Is Still v32

**Date:** 2026-06-15

## Proof table

| # | Question | Answer |
|---|----------|--------|
| 1 | Lenha fix committed? | **No** — 142 lines unstaged in working tree |
| 2 | HEAD for extract-invoice? | **`9dbc591`** (OCR hardening only) |
| 3 | Production version? | **v32**, deployed 2026-06-14 |
| 4 | Prod matches fix? | **No** — matches pre-fix `9dbc591` bundle |
| 5 | Why still v32? | Fix never committed, never redeployed; client calls remote edge |

## Root cause

Production runs **extract-invoice v32** because the only deploy on record is **2026-06-14**, corresponding to committed edge code through **`9dbc591`**. The Lenha fix (band-scan header recovery + full-image retry) lives in the **uncommitted** working tree with zero matching commits and no subsequent `functions deploy`. Latest repo commit **`80ec44a`** is unrelated canonical UI work.

**Re-extract executes remote v32, not local fixes.**
