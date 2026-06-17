# Semantic ROI Analysis

**Date:** 2026-06-15

---

## Issues by category (% of ~15 debris rows)

| Category | Share |
|----------|-------|
| Brand prefix | ~33% |
| Procurement (fractions/weights/case) | ~40% |
| Commercial codes (HC/PNA/L1) | ~20% |
| Supplier suffix | ~13% |
| Culinary ambiguity | ~7% |

---

## ROI rank

| Rank | Opportunity | Rows | Transition |
|------|-------------|-----:|------------|
| 1 | Charcuterie/cheese brand prefix | 5 | 4 ACC→EXC + 1 WEAK→EXC |
| 2 | Wheel fractions 1/2, 1/8 | 3 | Subset of #1 |
| 3 | Assaporami + HC + Formaggi + Castello | 2 | ACC→EXC |
| 4 | Peroni PNA + dedupe | 1 | WEAK→EXC |
| 5 | Pellegrino Emporio cleanup | 1 | ACC→EXC |
| 6 | Sorrentino/guanciale artifact | 1 | ACC→EXC |
| 7 | Defer: Mancini, Stracciatella 250gr, Farina OCR, Anchovas L1 | 4 | Manual/context |

---

## Projected impact

- Italian EXCELLENT: **38% → ~76–86%**
- Overall usable: **+3–5pp** marginal
- Effort: **~2–3 days** scoped automation

**Verdict:** Remaining issues are **semantic naming**, not text cleanup or OCR. Limited by semantic understanding of brand vs culinary grade — not by pipeline mechanics.
