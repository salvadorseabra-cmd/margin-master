# Similar Products Scan

Source: `.tmp/ginger-beer-audit/similar-beverages.json` (2,000 recent `invoice_items`)

| Product | CL parse | Usable | €/L | Status |
|---------|----------|--------|-----|--------|
| **Baladin Ginger Beer 0.20cl** | **2 ml** | 4–48 ml | €425/L (24 un) | **SUSPECT** |
| San Pellegrino 75cl x 15ud | 750 ml | 1,500 ml | — (cx) | OK |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 750 ml | 1,500 ml | €27/L | OK |
| Birra Peroni 33cl*24 | 330 ml | 7,920 ml | ~€2.58/L | OK |

**Decimal-cl scan:** 1 row in VL — Ginger Beer only. Integer CL (`75cl`, `33cl`) parses correctly.

**Pattern:** Isolated to `0.XXcl` decimal tokens, not systemic across x24/x15 case products.
