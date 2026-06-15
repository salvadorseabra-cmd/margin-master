# Supplier Breakdown — Wheel Fractions & Procurement Codes

**Date:** 2026-06-15

---

## Wheel fractions

| Fraction | Rows | Supplier | Category |
|----------|-----:|----------|----------|
| **1/8** | 1 | Emporio | Cheese (Gorgonzola DOP dolce) |
| **1/2** | 2 | Emporio | Charcuterie (Mortadella, Bresaola) |
| **1/4** | 0 | — | Listed as future pattern only |

**Supplier distribution:** 100% Emporio Italia in current dataset.

**Verdict:** Wheel fractions are **procurement metadata** (portion of wheel ordered), not culinary identity. Kitchen identity = product type + grade (oro, massima, dolce). Strip from canonical; keep on purchase/alias layer.

---

## Supplier codes & SKU fragments

| Code | Rows | Supplier | Status |
|------|-----:|----------|--------|
| **HC** (+ weight range 4,3-4,5KG) | 1–2 | Emporio | Gap — still in suggestion |
| **PNA** | 1 | Mammafiore (Peroni) | Gap |
| **Nr. 125** | 1 | Emporio (De Cecco) | **Handled** via PASTA_SKU_NR_RE |
| **Assaporami** | 1 | Emporio (Prosciutto) | Gap — marketing line |

**Concentration:** 100% Emporio for HC/wheel/brand-dash; PNA is Mammafiore-only. Generalization beyond `Brand - Product` template is limited.

---

## Product categories affected

| Category | Patterns |
|----------|----------|
| Charcuterie | Rovagnati prefix, 1/2, HC |
| Cheese | Arrigoni Formaggi prefix, 1/8 |
| Cured meats | Rigamonti prefix, 1/2 |
| Beverages | PNA (Peroni), 15ud (Pellegrino) |
| Pasta | De Cecco (handled), Mancini (optional) |
