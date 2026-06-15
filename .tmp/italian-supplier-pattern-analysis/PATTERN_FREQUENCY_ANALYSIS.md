# Pattern Frequency Analysis — Italian Supplier Brands

**Date:** 2026-06-15  
**Source:** `.tmp/final-canonical-cleanup/scorecard-final.json` (33 VL rows; 21 Italian food)

---

## Brand prefix occurrences

| Brand | Invoice rows | In suggested canonical | Handled | Gap |
|-------|-------------:|------------------------|---------|-----|
| **Rovagnati** | 3 | 3 (retained) | No | **3** |
| **Rigamonti** | 1 | 1 | No | **1** |
| **Arrigoni / Arrigoni Formaggi** | 1 | 1 | No | **1** |
| **De Cecco** | 1 | 0 → Paccheri lisci | **Yes** | 0 |
| **Baladin** | 1 | 0 → Ginger beer | **Yes** | 0 |
| **Mancini** | 1 | 1 → mezzi paccheri mancini | Partial | 1 (optional) |

**Totals:** 8 brand-prefix invoice rows; **2 handled**, **6 gap** (5 definite + 1 context-dependent).

---

## Review & Create status

All 33 VL rows are unmatched. Italian rows are ACCEPTABLE/WEAK — quality polish, not pipeline failures.

---

## Code gap

`canonical-ingredient-display-name.ts` strips De Cecco/Baladin only. Rovagnati-style lines are intentionally not stripped (design tension vs Italian catalog quality audit).

---

## Verdict

**Recurring pattern** — same `Brand - Product` template across 5 of 8 Emporio rows. Mirrors De Cecco/Baladin, which Phase 3 already automated. Not isolated OCR noise.
