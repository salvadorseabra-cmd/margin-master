# Procurement Metadata Audit

**Date:** 2026-06-15  
**Scope:** 33 VL rows (32 food), post Final Cleanup suggestions

---

## Counts in current suggestions

| Pattern | Rows | Classification | Action |
|---------|-----:|----------------|--------|
| **75cl** | 2 | Culinary identity (beverage) | **Keep** |
| **33cl** | 1 | Culinary identity (beer) | **Keep** |
| **1/2** | 2 | Procurement (wheel portion) | Strip |
| **1/8** | 1 | Procurement | Strip |
| **250gr** | 1 | Ambiguous (stracciatella pack) | Context-dependent |
| **15ud** | 1 | Procurement (case count) | Strip |
| **HC + weight** | 1 | Procurement (supplier code) | Strip |
| **PNA** | 1 | Procurement (commercial code) | Strip |
| **495g** | 1 | Procurement (pack weight) | Strip |
| **500g, 1kg, 2kg, 25kg** | 0 | Already stripped | — |
| **1/4** | 0 | — | Future pattern only |

---

## Cleanup opportunity

- **~8 rows** with removable procurement debris (excluding beverage cl)
- **~3 rows** correctly keep 33cl/75cl

Wheel fractions and supplier codes are consistently procurement metadata, not culinary identity. Beverage serving formats (33cl, 75cl) are legitimate catalog attributes per `isServingFormatToken`.
