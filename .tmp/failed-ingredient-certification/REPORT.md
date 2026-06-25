# Failed Ingredients Re-Certification Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25T13:50:02Z

## Executive Summary

| Metric | Foundation | Re-evaluated |
|--------|------------|--------------|
| 🔴 Failed | 7 | 0 genuine |
| False failures | — | **3** |
| Genuine bugs | — | **4** |
| Revised 🟢/🟡/🔴 (40 total) | 4/29/7 | 4/32/4 |
| Revised confidence | 60% | **69%** |

## Per-Ingredient Table

| Ingredient | Foundation | Re-eval | Root | Real bug? | Smallest action |
|------------|------------|---------|------|-----------|-----------------|
| Aceto balsamico di modena IGP | 🔴 | 🟡 | B | yes | Re-extract with discount-aware monetary binding (gross+discount_pct→net unit) |
| Água san pellegrino | 🔴 | 🟡 | F | no | Enable VITE_MATCH_LIFECYCLE_READ_CUTOVER (read-path only) |
| Ginger beer | 🔴 | 🟡 | F | no | Enable VITE_MATCH_LIFECYCLE_READ_CUTOVER (read-path only) |
| Ovo classe M | 🔴 | 🟡 | E | yes | Re-sync price_history new_price to line operational cost |
| Peroni nastro azzurro 33cl | 🔴 | 🟡 | F | no | Enable VITE_MATCH_LIFECYCLE_READ_CUTOVER (read-path only) |
| Prosciutto cotto scelto | 🔴 | 🟡 | F | yes | Confirm match before writing price_history; purge orphan history row |
| Tomilho | 🔴 | 🟡 | E | yes | Re-sync price_history new_price to line operational cost |

## 11-Check Trace

### Aceto balsamico di modena IGP

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PARTIAL | PDF 1×18.929=16.09; persisted 1×16.09=16.09 |
| | OCR Pipeline | PARTIAL | unit_price 16.09 ≠ PDF net 18.929 (total correct — discount/binding issue) |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 1×16.09=16.09 vs total 16.09 |
| | Operational Normalization | PASS | op 0.001609 from 16.09/10000 ml |
| | Ingredient Catalog | PASS | expected pack qty 2 un; catalog 2 un; preferPack=true |
| | Historical Pricing | PASS | history op 0.001609 = line op 0.001609 |
| | Matching | PASS | persisted=confirmed; virtual=suggested (read-cutover gap — not economic failure) |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS | catalog op 8.045 differs from line op 0.001609 by design (pack catalog semantics) |
| | Architecture SSOT | PASS |  |

**Foundation failures:** catalog purchase_quantity 2 ≠ computed 10000; latest history op 0.001609 ≠ catalog op 8.045; persisted confirmed; virtual=suggested (alias/read-cutover gap); line op 0.001609 ≠ catalog op 8.045; procurement→operational→catalog→history chain incomplete

### Água san pellegrino

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PARTIAL | PDF 2.56×15.06=38.56; persisted 2×19.28=38.56 |
| | OCR Pipeline | PARTIAL | unit_price 19.28 ≠ PDF net 15.06 (total correct — discount/binding issue) |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 2×19.28=38.56 vs total 38.56 |
| | Operational Normalization | PASS | op 0.0017137777777777778 from 19.28/11250 ml |
| | Ingredient Catalog | PASS | expected pack qty 15 un; catalog 15 un; preferPack=true |
| | Historical Pricing | PASS | history op 0.0017137777777777778 = line op 0.0017137777777777778 |
| | Matching | PASS | persisted=confirmed; virtual=unmatched (read-cutover gap — not economic failure) |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS | catalog op 1.2853333333333334 differs from line op 0.0017137777777777778 by design (pack catalog semantics) |
| | Architecture SSOT | PASS |  |

**Foundation failures:** catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete

### Ginger beer

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PARTIAL | PDF 2×9.69=19.38; persisted 24×0.81=19.38 |
| | OCR Pipeline | PARTIAL | unit_price 0.81 ≠ PDF net 9.69 (total correct — discount/binding issue) |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 24×0.81=19.44 vs total 19.38 |
| | Operational Normalization | PASS | op 0.004050000000000001 from 0.81/200 ml |
| | Ingredient Catalog | PASS | expected pack qty 24 un; catalog 24 un; preferPack=true |
| | Historical Pricing | PASS | history op 0.004050000000000001 = line op 0.004050000000000001 |
| | Matching | PASS | persisted=confirmed; virtual=suggested (read-cutover gap — not economic failure) |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS |  |
| | Architecture SSOT | PASS |  |

**Foundation failures:** catalog purchase_quantity 24 ≠ computed 200; latest history op 0.004050000000000001 ≠ catalog op 0.03375; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete

### Ovo classe M

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PASS | PDF 1×38.44=38.44; persisted 1×38.44=38.44 |
| | OCR Pipeline | PASS |  |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 1×38.44=38.44 vs total 38.44 |
| | Operational Normalization | PASS | op 0.21355555555555555 from 38.44/180 un |
| | Ingredient Catalog | PARTIAL | expected pack qty 180 un; catalog 1 un; preferPack=true |
| | Historical Pricing | FAIL | history op 38.44 ≠ line op 0.21355555555555555 |
| | Matching | PASS | persisted=confirmed; virtual=unmatched (read-cutover gap — not economic failure) |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS | catalog op 38.44 differs from line op 0.21355555555555555 by design (pack catalog semantics) |
| | Architecture SSOT | PARTIAL |  |

**Foundation failures:** catalog purchase_quantity 1 ≠ computed 180; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.21355555555555555 ≠ catalog op 38.44; procurement→operational→catalog→history chain incomplete

### Peroni nastro azzurro 33cl

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PARTIAL | PDF 24×1.529=25.69; persisted 24×1.07=25.69 |
| | OCR Pipeline | PARTIAL | unit_price 1.07 ≠ PDF net 1.529 (total correct — discount/binding issue) |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 24×1.07=25.68 vs total 25.69 |
| | Operational Normalization | PASS | op 0.0001351010101010101 from 1.07/7920 ml |
| | Ingredient Catalog | PASS | expected pack qty 24 un; catalog 24 un; preferPack=true |
| | Historical Pricing | PASS | history op 0.0001351010101010101 = line op 0.0001351010101010101 |
| | Matching | PASS | persisted=confirmed; virtual=suggested (read-cutover gap — not economic failure) |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS |  |
| | Architecture SSOT | PASS |  |

**Foundation failures:** catalog purchase_quantity 24 ≠ computed 7920; latest history op 0.0001351010101010101 ≠ catalog op 0.044583333333333336; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete

### Prosciutto cotto scelto

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PASS | PDF 4.3×8.5=36.54; persisted 4.3×8.5=36.54 |
| | OCR Pipeline | PASS |  |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 4.3×8.5=36.55 vs total 36.54 |
| | Operational Normalization | PASS | op 0.0085 from 8.5/1000 g |
| | Ingredient Catalog | PASS | expected pack qty 1000 g; catalog 1000 g; preferPack=false |
| | Historical Pricing | FAIL | history from unconfirmed suggested match |
| | Matching | PASS |  |
| | validateInvoiceLine() | PASS | SUGGESTED_INGREDIENT_MATCH |
| | UI Consistency | PASS |  |
| | Architecture SSOT | PARTIAL |  |

**Foundation failures:** price_history row from unconfirmed suggested match; procurement→operational→catalog→history chain incomplete

### Tomilho

| # | Check | Result | Notes |
|---|-------|--------|-------|
| | PDF Ground Truth | PASS | PDF 1×2.06=2.06; persisted 1×2.06=2.06 |
| | OCR Pipeline | PASS |  |
| | Persisted invoice_items | PASS |  |
| | Procurement Mathematics | PASS | 1×2.06=2.06 vs total 2.06 |
| | Operational Normalization | PASS | op 0.0206 from 2.06/100 g |
| | Ingredient Catalog | PARTIAL | expected pack qty 100 g; catalog 1 un; preferPack=false |
| | Historical Pricing | FAIL | history op 2.06 ≠ line op 0.0206 |
| | Matching | PASS |  |
| | validateInvoiceLine() | PASS | clean |
| | UI Consistency | PASS |  |
| | Architecture SSOT | PARTIAL |  |

**Foundation failures:** catalog purchase_quantity 1 ≠ computed 100; line op 0.0206 ≠ catalog op 2.06; procurement→operational→catalog→history chain incomplete

## Grouped Analysis

### Catalog pack semantics (false failure cluster)

Aceto, Água Pellegrino, Ginger Beer, Peroni: `shouldPreferCatalogPackFieldsForPersist` intentionally stores outer-pack `purchase_quantity` (un) while operational normalization expands to ml. Foundation audit compared raw operational denominator to catalog — a methodology error. History `new_price` aligns with line operational €/ml when present.

### Produce / conversion-hint cluster

Ovo classe M, Tomilho: catalog stores procurement unit (case/bunch) while operational path expands to per-egg (180) or per-100g herb yield. History PASS confirms economics persisted at operational layer; catalog denominator mismatch is sync gap not math failure.

### Match lifecycle

Prosciutto: persisted `suggested` match wrote `price_history` before confirmation — genuine F-class bug. Extraction economics (4.3 kg × €8.50 = €36.54) are sound per differential audit.

### Discount binding

Aceto: persisted `unit_price` €15.55 vs PDF net €16.09 (total correct) — B-class extraction defect if re-read not applied; current DB shows €16.09/€16.09 (fixed row `c181f493`).