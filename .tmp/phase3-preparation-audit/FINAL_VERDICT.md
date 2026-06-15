# Final Verdict — Phase 3 Preparation Audit

**Date:** 2026-06-15

---

## 1. Four EMPTY rows

1. **De Cecco - Paccheri Lisci Nr. 125 - 500g** — Emporio Italia  
2. **Baladin - Ginger Beer 0.20cl** — Emporio Italia  
3. **Recargo por combustibili** — Mammafiore Portugal  
4. **ACQUA S.PELLEGRINO (CX 75CL*15)** — IL BOCCONCINO  

---

## 2. Four WEAK rows

1. **Rulo Di Capra 1kg*2 Simonetta** — Mammafiore Portugal  
2. **Farina do pasta fresca e gnocchi25kg Caputo** — Mammafiore Portugal  
3. **MOZZA Fior di Latte Expet Julienne 3kg Simonetta** — Mammafiore Portugal  
4. **Aceto balsamico di modena IGP pet 5l*2 Toschi** — Mammafiore Portugal  

---

## 3. How many root causes remain?

**3 fixable root causes** (+ 1 deliberate exclusion):

| # | Cause | Rows |
|---|-------|------|
| 1 | Missing Mammafiore/Emporio supplier brand tokens | 4 WEAK + 2 EMPTY |
| 2 | Branded dash-prefix / beverage SKU normalization | 2–3 EMPTY |
| 3 | Non-food line in catalog workflow | 1 EMPTY |

Not 8 independent problems.

---

## 4. Does Phase 3 require ontology?

**Minimally yes** — for 3–5 rules only:

- `Brand - Product` → `Product` (De Cecco, Baladin)
- `MOZZA` → `Mozzarella` (shorthand expansion)
- Beverage pack line handling (ACQUA)

Most remaining gain is still **normalization** (simonetta, caputo, toschi, pet).

---

## 5. Is a full ontology justified?

**No.** Remaining failures are concentrated on **one supplier's brand suffix pattern** and **3 Emporio/Bocconcino specialty lines**. Full taxonomy would be over-engineering.

---

## 6. Smallest change capable of 85%+ usable?

**Add 3 supplier brand tokens** (`simonetta`, `caputo`, `toschi`) + pack debris strip (`*2`, `pet`).

- Current: 25/33 (75.8%)
- Expected: 28–29/33 (**85–88%**)
- Effort: ~3 days, same pattern as Phase 2

---

## 7. Recommended Phase 3 scope

**Option A (tiny targeted rules)** with selective Option B seeds:

| Priority | Action |
|----------|--------|
| P0 | Add `simonetta`, `caputo`, `toschi` to noise tokens |
| P0 | Strip `pet`, `*N` pack debris; fix fused `gnocchi25kg` |
| P1 | `MOZZA` → `Mozzarella` shorthand |
| P1 | Exclude `recargo` from Review & Create eligibility |
| P2 | Brand-dash split for De Cecco / Baladin |
| P2 | ACQUA Pellegrino pack shorthand |
| **Defer** | `s/Sal` → `sem sal` (Manteiga already ACCEPTABLE) |
| **Defer** | Full ontology framework |

---

## Verdict

**Proceed with a minimal Phase 3** — not a large ontology build. The data proves Phase 1–2 cleared Bidfood and most VL rows; **8 remaining rows = 3 patterns**. Target **85%** with brand token batch; target **90%** with Emporio beverage/pasta rules.

**Do not implement yet** — this audit establishes scope only.
