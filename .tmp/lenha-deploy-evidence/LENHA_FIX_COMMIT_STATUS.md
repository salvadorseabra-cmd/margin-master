# Lenha Fix Commit Status

**Date:** 2026-06-15

## Is the fix committed?

**No.** Only working tree changes; nothing staged or committed.

## Per-file status

| File | In HEAD (`9dbc591`)? | Uncommitted? |
|------|----------------------|--------------|
| `index.ts` | yes (no `footerFromPass.total` pass) | 12 lines |
| `invoice-crop-geometry.ts` | no `TABLE_HEADER_BAND_SCAN_END_FRACTION` | 13 lines |
| `invoice-image-crop.ts` | no `detectWhiteHeaderTopByBandScan` | 80 lines |
| `invoice-table-extraction.ts` | no `table-pass-empty-retry` | 113 lines |
| `invoice-image-crop.test.ts` | no Lenha regression test | 14 lines |

## Commit search

```
git log --grep=lenha -i          → (empty)
git log --grep=detectWhiteHeaderTopByBandScan → (empty)
git log --grep=table-pass-empty-retry         → (empty)
```

`.tmp/lenha-extraction-fix/` is **untracked** — not in any commit.
