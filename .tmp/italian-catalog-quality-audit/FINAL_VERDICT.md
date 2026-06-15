# Final Verdict — Italian Catalog Quality Audit

**Date:** 2026-06-15

---

## Summary

21 Italian food rows reviewed across Emporio, Bocconcino, and Mammafiore. Pipeline is no longer failing — this is a **catalog quality** question. Top issues: (1) charcuterie/cheese brands retained, (2) wheel fractions and supplier codes in names, (3) San Pellegrino Emporio path pack debris.

---

## Ideal canonicals — six user examples

| Product | Ideal canonical |
|---------|-----------------|
| San Pellegrino | **Água San Pellegrino 75cl** |
| Rigamonti Bresaola | **Bresaola punta d'anca oro** |
| Rovagnati Salame Ventricina | **Salame ventricina** |
| Arrigoni Gorgonzola | **Gorgonzola DOP dolce** |
| Rovagnati Prosciutto Cotto | **Prosciutto cotto scelto** |
| Rovagnati Mortadella | **Mortadella IGP massima com pistacchio** |

---

## Attributes: remain vs remove

| **Remain in catalog name** | **Remove (→ purchase/alias)** |
|-----------------------------|--------------------------------|
| Core noun (bresaola, mortadella, gorgonzola) | Brand prefix (Rovagnati, Rigamonti, Arrigoni) |
| DOP / IGP | Wheel fractions (1/2, 1/8) |
| Culinary grade (oro, scelto, massima, dolce) | Weight, case counts |
| Variants (com pistacchio, punta d'anca) | Supplier codes (HC, PNA, Nr. 125) |
| Beverage format (75cl, 33cl) | Marketing lines (Assaporami) |
| Product-defining brands (San Pellegrino, Peroni) | |

---

## Recommendations

1. **Further automation justified?** Yes — scoped (~2–3 days): charcuterie prefix strip, wheel fractions, Pellegrino pack cleanup.
2. **Manual review sufficient?** Yes for launch volume; automate when Italian invoices are routine.
3. **Do not** strip San Pellegrino or collapse fior di latte to chase score.
4. **Objective:** Build a catalog a restaurant owner would browse happily in five years — culinary nouns + protected designations, not invoice debris.

---

## Review & Create status

Canonical Identity pipeline + validation blocker fix make Review & Create **usable**. Italian premium rows are **ACCEPTABLE/WEAK**, not EMPTY — quality polish is optional Phase 4, not a blocker.
