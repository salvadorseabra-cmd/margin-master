# Pattern Analysis — Canonical Semantic Audit

**Date:** 2026-06-15

## By supplier

| Supplier | Rows | GOOD | Problematic | Dominant issue |
|----------|-----:|-----:|------------:|----------------|
| Bidfood | 10 | 10 | 0 | None — Phase 1+2 success |
| Emporio | 8 | 2 | 6 | Brand prefix on `Brand - Product` lines |
| Mammafiore | 8 | 4 | 3 | Distributor suffix + beverage codes |
| Bocconcino | 6 | 4 | 2 | Pasta mill brand; cheese weight |
| Aviludo | 1 | 0 | 1 | Supplier code + weight |

## By token type (problematic only)

| Token type | Frequency | Examples |
|------------|----------:|----------|
| Charcuterie/cheese brand prefix | 5 | rovagnati×3, rigamonti, arrigoni |
| Wheel fraction 1/2, 1/8 | 3 | mortadella, bresaola, gorgonzola |
| Marketing/commercial line | 3 | assaporami, formaggi, linea castello |
| Supplier code | 3 | HC, PNA, l1 |
| Distributor suffix | 3 | amoruso, sorrentino, alconfirsta |
| Case/pack count | 2 | 15ud, 250gr |
| Duplicate brand token | 1 | nastro azzurro×2 |

## Code root cause

`INVOICE_BRAND_PREFIX_STRIP_RE` only covers De Cecco + Baladin. Rovagnati/Rigamonti/Arrigoni intentionally retained — contradicts brand retention framework.

## Classification counts (food only)

| Class | Count | % |
|-------|------:|--:|
| GOOD | 20 | 62.5% |
| BRAND_LEAK | 7 | 21.9% |
| COMMERCIAL_DESCRIPTOR_LEAK | 3 | 9.4% |
| PACKAGE_METADATA_LEAK | 2 | 6.3% |

Mechanical scorecard "usable" 87.9% **overstates** semantic quality (62.5% GOOD).
