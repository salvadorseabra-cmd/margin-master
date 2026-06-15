# Brand vs Product Identity — Italian Suppliers

**Date:** 2026-06-15

---

## Classification framework

| Type | Meaning | Canonical action |
|------|---------|------------------|
| **A — Pure noise** | Distributor/channel suffix | REMOVE |
| **B — Product-defining** | Brand is substitution boundary | KEEP |
| **C — Context-dependent** | Brand matters in procurement, not kitchen noun | STRIP default; alias layer |

---

## Per-brand verdict

| Brand | Class | Verdict | Reasoning |
|-------|-------|---------|-----------|
| **San Pellegrino** | B | **ALWAYS PRESERVE** | PT foodservice orders by brand (Pellegrino ≠ Luso ≠ Pedras). |
| **Peroni** | B | **PRESERVE** | Branded beer line; same logic as San Pellegrino. |
| **De Cecco** | C | **STRIP** | Culinary identity = pasta shape. Implemented. |
| **Baladin** | C | **STRIP (default)** | Canonical = ginger beer unless multi-brand bar. Implemented. |
| **Rovagnati** | C | **STRIP (default)** | Identity = product type + IGP/variant. Brand → alias. **Gap: pipeline keeps brand.** |
| **Rigamonti** | C | **STRIP (default)** | Identity = bresaola punta d'anca oro. **Gap: pipeline keeps brand.** |
| **Arrigoni** | A (prefix) | **STRIP** | Cheese distributor, not kitchen category. **Gap: pipeline keeps.** |
| **Mancini** | C | **STRIP unless multi-brand paccheri** | Artisan mill; same rule as De Cecco. |
| **Simonetta / Sorrentino / Amoruso / Toschi / Caputo** | A | **STRIP** | Mammafiore distributor suffixes. Mostly fixed. |

---

## Always strip vs always preserve

| Always strip | Always preserve |
|--------------|-----------------|
| Rovagnati, Rigamonti, Arrigoni (prefix) | San Pellegrino, Peroni |
| Simonetta, Sorrentino, Toschi, Amoruso | DOP, IGP |
| De Cecco, Baladin (prefix) | fior di latte, julienne, pelati |
| Assaporami, Formaggi, HC codes | |

| Context-dependent | Default |
|-------------------|---------|
| Mancini, Caputo, Castello line | Strip unless multi-SKU |
