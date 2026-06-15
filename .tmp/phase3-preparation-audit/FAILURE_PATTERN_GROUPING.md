# Failure Pattern Grouping

**Date:** 2026-06-15  
**Question:** Are there 8 unique problems, or fewer root causes?

---

## Answer: **3 root causes**, not 8

The 8 remaining rows collapse into **3 fixable patterns** plus **1 deliberate exclusion**.

---

## Pattern A — Italian distributor brand suffix (4 WEAK)

**Rows:** Rulo Di Capra… Simonetta · Farina… Caputo · MOZZA… Simonetta · Aceto… Toschi

**Mechanism:** `simonetta`, `caputo`, `toschi` not in `CATALOG_NOISE_TOKENS`. Pack debris (`*2`, `pet`) partially unstripped.

**Fix type:** Normalization (token list) + 1 shorthand rule (`MOZZA` → `Mozzarella`)

**Effort:** Low

---

## Pattern B — Branded prefix lines / beverage SKU (3 EMPTY fixable)

**Rows:** De Cecco Paccheri · Baladin Ginger Beer · ACQUA S.PELLEGRINO

**Mechanism:** Leading brand before dash; cleanup ≡ alias or no distinct suggestion. Beverage/pasta need brand strip + product noun extraction.

**Fix type:** Small ontology (brand strip templates) + normalization (`Nr. 125`, parenthetical pack)

**Effort:** Medium

---

## Pattern C — Non-food invoice line (1 EMPTY)

**Row:** Recargo por combustibili

**Mechanism:** Not an ingredient — fuel surcharge.

**Fix type:** Workflow exclusion (`isEligibleInvoiceIngredientRow` filter), not canonical generation.

**Effort:** Low (eligibility rule)

---

## Pattern D — (Subsumed) Dairy terminology

**Manteiga s/Sal → sem sal** — already ACCEPTABLE after Phase 2; **not** in remaining 8.

---

## Pattern E — (Subsumed) Cured meats

Emporio Rovagnati/Rigamonti lines are **ACCEPTABLE** after Phase 2 (brand retained in suggestion but scorecard classifies ACCEPTABLE). **Not** in remaining 8.

---

## Matrix

| Pattern | Rows | Root cause | Phase 3 fix |
|---------|------|------------|---------------|
| A | 4 WEAK | Missing supplier brand tokens | Normalization + 1 shorthand |
| B | 3 EMPTY | Brand prefix / beverage SKU | Small ontology + normalization |
| C | 1 EMPTY | Non-food | Eligibility exclusion |
| **Total** | **8** | **3 causes** | — |

---

## Rows NOT requiring unique solutions

| Row | Shares pattern with |
|-----|---------------------|
| Rulo Di Capra | MOZZA, Aceto (Simonetta) |
| Farina Caputo | Aceto (Caputo/Toschi brand strip) |
| MOZZA Fior di Latte | Rulo (Simonetta + cheese shorthand) |
| Aceto Toschi | Farina (brand suffix) |
| De Cecco | Baladin (branded dash prefix) |
| Baladin | De Cecco |
| ACQUA Pellegrino | Baladin (beverage) |
| Recargo | Unique — exclude, don't canonicalize |

**Conclusion:** Phase 3 should be **small** — not a full culinary ontology framework.
