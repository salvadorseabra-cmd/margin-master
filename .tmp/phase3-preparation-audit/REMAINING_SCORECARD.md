# Remaining Scorecard — After Phase 2

**Date:** 2026-06-15  
**Source:** `.tmp/phase2-noise-cleanup/scorecard-phase2.json` (33 unmatched Review & Create rows)  
**Post-Phase 2:** 25 usable (75.8%) · 4 EMPTY · 4 WEAK

---

## EMPTY (4)

| # | Invoice line | Suggested | Supplier | Reason (summary) |
|---|--------------|-----------|----------|------------------|
| 1 | De Cecco - Paccheri Lisci Nr. 125 - 500g | `null` | Emporio Italia | Branded pasta SKU; cleanup ≡ alias or no distinct suggestion |
| 2 | Baladin - Ginger Beer 0.20cl | `null` | Emporio Italia | Branded beverage; alias guard / no catalog-ready path |
| 3 | Recargo por combustibili | `null` | Mammafiore Portugal | Non-food surcharge line |
| 4 | ACQUA S.PELLEGRINO (CX 75CL*15) | `null` | IL BOCCONCINO | Pack-only beverage notation; suggestion suppressed |

---

## WEAK (4)

| # | Invoice line | Suggested | Supplier | Retained noise |
|---|--------------|-----------|----------|----------------|
| 1 | Rulo Di Capra 1kg*2 Simonetta | `Rulo di capra *2 simonetta` | Mammafiore Portugal | `*2`, **simonetta** |
| 2 | Farina do pasta fresca e gnocchi25kg Caputo | `Farina do pasta fresca e gnocchi caputo` | Mammafiore Portugal | **caputo**, fused `gnocchi25kg` |
| 3 | MOZZA Fior di Latte Expet Julienne 3kg Simonetta | `Mozza fior di latte expet julienne simonetta` | Mammafiore Portugal | **mozza**, **expet**, **simonetta** |
| 4 | Aceto balsamico di modena IGP pet 5l*2 Toschi | `Aceto balsamico di modena IGP pet *2 toschi` | Mammafiore Portugal | **pet**, **\*2**, **toschi** |

---

## Usable context

| Class | Count | % |
|-------|-------|---|
| EXCELLENT | 6 | 18.2% |
| ACCEPTABLE | 19 | 57.6% |
| WEAK | 4 | 12.1% |
| EMPTY | 4 | 12.1% |
| **Usable** | **25** | **75.8%** |

All 8 problematic rows are from **Emporio (2 EMPTY)**, **Mammafiore (5)**, **Bocconcino (1 EMPTY)**. Bidfood is fully cleared (0 remaining failures).
