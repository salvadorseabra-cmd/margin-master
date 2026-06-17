# Frequency Analysis — Produto de Stock

**Date:** 2026-06-15

---

| Source | Contaminated | Total | Rate |
|--------|-------------|-------|------|
| Emporio DB snapshot (duplicate-trace) | 14 rows | 16 rows | 87.5% |
| Unique product types | 7 lines | 8 lines | 87.5% (Baladin clean) |
| 10-run stability (all-runs.json) | ~64 item slots | 80 | **80%** |
| Runs with any contamination | 8 runs | 10 | 80% |
| scorecard-final.json | 0 | 33 | 0% (clean inputs) |
| Other suppliers in `.tmp/` | 0 | — | **Emporio-only** |

---

## Classification

**Emporio Italia invoice layout only.** No matches on Bidfood, Bocconcino, Aviludo, etc.

Not a broad canonical regression — contaminated DB rows vs clean scorecard fixtures explain why suggestions looked cleaner in audits than in live Review & Create.
