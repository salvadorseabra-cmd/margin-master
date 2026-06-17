# Semantic Scorecard — Phase 4

**Date:** 2026-06-16  
**Rows:** 32 food (VL Review & Create extract, excl. Recargo)  
**Method:** `buildCanonicalIngredientCreateDefaults` + deterministic classifier (GOOD / BRAND_LEAK / COMMERCIAL_DESCRIPTOR_LEAK / PACKAGE_METADATA_LEAK)

## Summary

| Metric | Before | After |
|--------|-------:|------:|
| **GOOD** | **20 (62.5%)** | **30 (93.8%)** |
| BRAND_LEAK | 7 | 0 |
| COMMERCIAL_DESCRIPTOR_LEAK | 3 | 1 |
| PACKAGE_METADATA_LEAK | 2 | 1 |
| Problematic | 12 | 2 |

**Target:** ~85–90% GOOD — **met (93.8%)**

## Row transitions (12 changed class)

| Invoice | Before | After |
|---------|--------|-------|
| Rovagnati Salame Ventricina | BRAND_LEAK | GOOD |
| Arrigoni Gorgonzola | COMMERCIAL_DESCRIPTOR_LEAK | GOOD |
| Rovagnati Prosciutto | COMMERCIAL_DESCRIPTOR_LEAK | GOOD |
| Rovagnati Mortadella | BRAND_LEAK | GOOD |
| Rigamonti Bresaola | BRAND_LEAK | GOOD |
| Guanciale Sorrentino | BRAND_LEAK | GOOD |
| Birra Peroni | COMMERCIAL_DESCRIPTOR_LEAK | GOOD |
| Farine Speciale Amoruso | BRAND_LEAK | GOOD |
| MEZZI PACCHERI MANCINI | BRAND_LEAK* | GOOD |
| STRACCIATELLA 250 GR | PACKAGE_METADATA_LEAK* | GOOD |
| SanPellegrino Emporio | PACKAGE_METADATA_LEAK | COMMERCIAL_DESCRIPTOR_LEAK |
| Filete Anchovas | BRAND_LEAK | PACKAGE_METADATA_LEAK |

\*Mancini / Stracciatella reclassified GOOD by policy (intentionally retained tokens).

## Remaining problematic (2)

| Invoice | Suggestion | Class | Note |
|---------|------------|-------|------|
| SanPellegrino - Acqua in vitro 75cl x 15ud | San pellegrino água in vitro 75cl | COMMERCIAL_DESCRIPTOR_LEAK | OCR `in vitro`; 15ud fixed |
| Filete de Anchovas Alconfirsta L1 495 g | Filete de anchovas 495g | PACKAGE_METADATA_LEAK | Brand/code fixed; 495g pack weight retained |

Raw data: `scorecard-phase4.json`
