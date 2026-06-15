# Final Phase 3 Recommendation

**Date:** 2026-06-15  
**Principle:** Catalog quality over score.

---

## 1. Which rows should be fixed?

**All 7 food rows:**
- 4 WEAK (Simonetta/Caputo/Toschi + pack debris + MOZZA shorthand)
- 3 EMPTY (De Cecco, Baladin, ACQUA Pellegrino)

---

## 2. Which should remain unchanged?

**Recargo por combustibili** — correct to stay out of catalog. Exclude from Review & Create eligibility; not a canonical failure.

---

## 3. Brands safe to strip

Simonetta, Toschi, Caputo (Mammafiore suffix pattern), Baladin prefix, De Cecco prefix, `pet`, `expet`, `*N` multipack debris, `Nr. 125` SKU fragments.

---

## 4. Brands that should remain in canonical

- **San Pellegrino** (normalized spelling)
- **IGP / DOP** designations
- **fior di latte**, **julienne**, pasta shapes (`paccheri lisci`)

Route to alias/brand-tag layer when needed: Caputo, De Cecco, Baladin, Toschi.

---

## 5. Realistic maximum score without harming quality

| Scenario | Usable | % |
|----------|--------|---|
| Current (Phase 2) | 25/33 | 75.8% |
| Fix 4 WEAK only | 29/33 | 87.9% |
| + 3 EMPTY food rows | 32/33 | 97.0% |
| Food rows only (excl. Recargo) | 32/32 | 100% of food |

**Quality-first realistic ceiling: ~91–94% (30–31/33).** Chasing 97% by stripping San Pellegrino or collapsing MOZZA to generic Mozzarella would harm catalog quality.

---

## 6. Is Phase 3 still justified?

**Yes — minimal Phase 3 only.**

- 3 root causes, ~3–5 days
- Extends proven Phase 2 pattern
- No matcher sync, pack variants, or LLM

**Not justified:** full ontology framework, broad category taxonomy.

---

## 7. Is culinary ontology still justified?

**Minimally — 3–5 seed rules:**

1. `Brand - Product` → `Product` (De Cecco, Baladin)
2. `MOZZA` → `Mozzarella` (protect fior di latte)
3. Beverage pack parenthetical → `Água San Pellegrino 75cl`
4. Non-food exclusion (`recargo`)

**Not justified:** full hierarchical taxonomy. Remaining failures are supplier-format edge cases, not systemic culinary knowledge gap.

---

## Priority (quality-ordered)

| Priority | Action |
|----------|--------|
| P0 | Add `simonetta`, `caputo`, `toschi`; strip `pet`, `*N`, fused weights, `expet` |
| P1 | `MOZZA` → `Mozzarella`; exclude `recargo` from eligibility |
| P2 | Brand-dash split (De Cecco, Baladin); ACQUA Pellegrino shorthand (keep brand) |

---

## Verdict

**7 rows are real catalog problems worth fixing. 1 row (Recargo) is correct exclusion.** Phase 3 is justified as a **small, targeted** pass — not a large ontology build. Optimize for meaningful kitchen identities, not maximum scorecard percentage.
