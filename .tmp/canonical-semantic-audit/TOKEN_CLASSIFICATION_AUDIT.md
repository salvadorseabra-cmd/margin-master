# Token Classification Audit

**Date:** 2026-06-15

| Token | Category | Action |
|-------|----------|--------|
| Rigamonti | Brand (charcuterie producer) | REMOVE — culinary = bresaola + cut |
| Rovagnati | Brand / supplier prefix | REMOVE — identity = product type + IGP/grade |
| Arrigoni | Supplier (cheese distributor) | REMOVE |
| Assaporami | Marketing line | REMOVE |
| Mancini | Brand (artisan pasta mill) | CONTEXT — strip default |
| Peroni | Brand (substitution boundary) | KEEP |
| San Pellegrino | Brand (substitution boundary) | KEEP |
| Oro | Culinary identity (bresaola grade) | KEEP |
| Massima | Culinary identity (mortadella grade) | KEEP |
| Punta d'Anca | Cut/style | KEEP |
| Scelto | Culinary identity (prosciutto quality) | KEEP |
| IGP / DOP | Protected designation | KEEP |
| Linea Castello | Marketing / sub-line | REMOVE |
| HC | Commercial code / procurement | REMOVE |
| PNA | Commercial code | REMOVE |
| 1/2, 1/8 | Procurement (wheel portion) | REMOVE |
| 75cl, 33cl | Culinary identity (serving format) | KEEP |
