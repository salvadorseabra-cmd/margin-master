# Duplication Audit

**Date:** 2026-06-15

---

## Repeated tokens in suggestions

| Duplicate pattern | Occurrences | Row |
|-------------------|------------:|-----|
| **nastro azzurro** (twice) | 1 row, 2 tokens | Birra Peroni |
| **san pellegrino** / brand repeat | 0 | — |
| Other repeated words | 0 | — |

---

## Verdict

**1 row** with clear duplication (Peroni). Clearest single-fix ROI for deduplication logic.

Example:
`Birra peroni nastro azzurro PNA 33cl nastro azzurro` → ideal: `Cerveja Peroni Nastro Azzurro 33cl`
