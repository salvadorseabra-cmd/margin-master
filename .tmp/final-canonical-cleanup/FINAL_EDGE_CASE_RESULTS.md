# Final Edge Case Results (8 target rows)

**Date:** 2026-06-15

---

| # | Invoice | Before (Phase 2) | After | Status |
|---|---------|------------------|-------|--------|
| 1 | Rulo Di Capra 1kg*2 Simonetta | WEAK — `Rulo di capra *2 simonetta` | **Rulo di capra** | ✅ Fixed |
| 2 | Farina do pasta fresca e gnocchi25kg Caputo | WEAK — `…gnocchi caputo` | **Farina do pasta fresca e gnocchi** | ✅ Fixed |
| 3 | MOZZA Fior di Latte Expet Julienne 3kg Simonetta | WEAK — `Mozza fior di latte expet julienne simonetta` | **Mozzarella fior di latte julienne** | ✅ Fixed |
| 4 | Aceto balsamico di modena IGP pet 5l*2 Toschi | WEAK — `…IGP pet *2 toschi` | **Aceto balsamico di modena IGP** | ✅ Fixed |
| 5 | De Cecco - Paccheri Lisci Nr. 125 - 500g | EMPTY — null | **Paccheri lisci** | ✅ Fixed |
| 6 | Baladin - Ginger Beer 0.20cl | EMPTY — null | **Ginger beer** | ✅ Fixed |
| 7 | ACQUA S.PELLEGRINO (CX 75CL*15) | EMPTY — null | **Água san pellegrino 75cl** | ✅ Fixed |
| 8 | Recargo por combustibili | EMPTY — null | **null (excluded)** | ✅ Correct exclusion |

**7/7 food rows improved. 1/1 non-food row correctly excluded.**

---

## Identity preservation checks

| Case | Requirement | Result |
|------|-------------|--------|
| MOZZA + fior di latte | Must not collapse to generic Mozzarella | ✅ Keeps `fior di latte julienne` |
| San Pellegrino | Brand must remain (not generic Água) | ✅ `Água san pellegrino 75cl` |
| IGP on aceto | Protected designation kept | ✅ `…modena IGP` |
| De Cecco paccheri | Shape identity kept, brand stripped | ✅ `Paccheri lisci` |
| Mozzarella Fior di Latte (regression) | Unaffected by MOZZA rule | ✅ Still `Mozzarella fior di latte` |
