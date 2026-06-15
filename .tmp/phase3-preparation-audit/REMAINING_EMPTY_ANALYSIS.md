# Remaining EMPTY Analysis

**Date:** 2026-06-15

---

## 1. De Cecco - Paccheri Lisci Nr. 125 - 500g

| Field | Detail |
|-------|--------|
| **Supplier** | Emporio Italia |
| **Suggested** | `null` |
| **Root cause** | Multi-token branded pasta line. Display cleanup strips `500g` but retains `De Cecco`, `Nr. 125`, and product tokens. Normalized suggestion folds to invoice alias → guard nulls. Not `catalogReady` (>2 tokens, digits). |
| **Why Phase 1 failed** | Not simple produce/herb; guard UX does not apply. |
| **Why Phase 2 failed** | `De Cecco` not in noise list (treated as product line prefix, not added). `Nr. 125` SKU fragment not stripped. No pasta-category rules. |
| **Classification** | **Normalization gap** + **ontology gap** (pasta shape vs brand) |

**Ideal Phase 3 target:** `Paccheri lisci` or `Paccheri` (not in scope for noise-only)

---

## 2. Baladin - Ginger Beer 0.20cl

| Field | Detail |
|-------|--------|
| **Supplier** | Emporio Italia |
| **Suggested** | `null` |
| **Root cause** | Branded beverage with dash-separated supplier prefix. Cleanup likely ≡ alias after title-case only, or `0.20cl` OCR token prevents distinct output. |
| **Why Phase 1 failed** | Not catalog-ready produce. |
| **Why Phase 2 failed** | `Baladin` not in noise tokens. Beverage serving-size rules preserve `cl` tokens; no brand-strip for craft beverages. |
| **Classification** | **Normalization gap** (brand prefix) |

**Ideal Phase 3 target:** `Ginger beer` (ontology: strip leading brand)

---

## 3. Recargo por combustibili

| Field | Detail |
|-------|--------|
| **Supplier** | Mammafiore Portugal |
| **Suggested** | `null` |
| **Root cause** | Fuel/delivery surcharge — not a food ingredient. No culinary canonical exists. |
| **Why Phase 1 failed** | Not catalog-ready; correctly excluded from pre-fill. |
| **Why Phase 2 failed** | No noise tokens apply; line should not enter ingredient catalog. |
| **Classification** | **Deliberate exclusion** / **unsupported category** (non-food) |

**Phase 3 action:** Exclude from Review & Create eligibility, not canonical generation.

---

## 4. ACQUA S.PELLEGRINO (CX 75CL*15)

| Field | Detail |
|-------|--------|
| **Supplier** | IL BOCCONCINO Distribuição ALIMENTAR |
| **Suggested** | `null` |
| **Root cause** | Pack-only parenthetical `(CX 75CL*15)` dominates line. Operational/shorthand `S.PELLEGRINO` path; cleanup ≡ alias after fold. |
| **Why Phase 1 failed** | Not simple herb/produce. |
| **Why Phase 2 failed** | Parenthetical pack pattern partially handled but line still folds to alias. `SanPellegrino` variant on Emporio row became ACCEPTABLE; Bocconcino shorthand format differs. |
| **Classification** | **Normalization gap** (beverage pack shorthand) |

**Ideal Phase 3 target:** `Água San Pellegrino 75cl` or `Água mineral` (ontology)

---

## EMPTY summary

| Classification | Count | Rows |
|----------------|-------|------|
| Normalization gap | 3 | De Cecco, Baladin, ACQUA |
| Deliberate exclusion | 1 | Recargo |
| Bug | 0 | — |

Only **3 EMPTY rows** are fixable canonical targets; **1** should be excluded from catalog workflow.
