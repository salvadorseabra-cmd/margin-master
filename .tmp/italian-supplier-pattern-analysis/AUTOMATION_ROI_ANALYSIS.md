# Automation ROI Analysis — Italian Supplier Patterns

**Date:** 2026-06-15

---

## Rule sets

| Set | Description |
|-----|-------------|
| **A** | Strip charcuterie/cheese brand prefixes: Rovagnati, Rigamonti, Arrigoni Formaggi |
| **B** | Strip wheel fractions: 1/2, 1/4, 1/8 |
| **C** | Strip procurement codes: HC, PNA, Assaporami, SKU fragments |

---

## Impact by rule set

| Rule set | Unique rows | WEAK→ACCEPTABLE | WEAK→EXCELLENT | ACCEPTABLE→EXCELLENT |
|----------|------------:|----------------:|---------------:|---------------------:|
| A alone | 5 | 0 | 1 (Arrigoni) | 4 |
| B (additive) | 3 | — | — | (same rows, cleaner) |
| C (additive) | 2 | 0 | 1 (Peroni) | 1 (Prosciutto) |
| Ancillary (Pellegrino, Formaggi) | 2–3 | — | — | 2–3 |
| **Combined unique** | **8–10** | **0–1** | **2** | **6–8** |

---

## Scale

| Metric | Value |
|--------|-------|
| Italian food rows | 21 |
| Rows improved by scoped automation | **8–10 (38–48%)** |
| Already EXCELLENT | 8 (38%) |
| Still ACCEPTABLE/WEAK with debris | 13 (62%) |

**Projected quality gain:**
- Italian EXCELLENT: **38% → ~76–86%**
- Overall VL usable: **~87.9% → ~93–95%** (marginal — polish, not usability unlock)

**Effort:** ~2–3 days. Full Italian ontology (~2+ weeks) **not justified**.

---

## Top automations ranked by ROI

| Rank | Automation | Rows | Risk | Transitions |
|------|------------|-----:|------|-------------|
| 1 | Rule Set A — brand prefix strip | 5 | LOW | 4 ACCEPTABLE→EXCELLENT; 1 WEAK→EXCELLENT |
| 2 | Rule Set B — wheel fractions | 3 | LOW | Subset of A |
| 3 | Assaporami + HC strip | 1 | LOW | Prosciutto ACCEPTABLE→EXCELLENT |
| 4 | San Pellegrino Emporio pack cleanup | 1 | LOW | ACCEPTABLE→EXCELLENT |
| 5 | Peroni PNA + dedupe | 1 | LOW–MED | WEAK→ACCEPTABLE/EXCELLENT |
