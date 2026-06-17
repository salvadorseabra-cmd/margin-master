# Before / After Examples — Produto de Stock Fix

**Date:** 2026-06-15

Pipeline: `cleanInvoiceItemDisplayName` → `formatCanonicalIngredientDisplayName` / `buildCanonicalIngredientCreateDefaults`.

## Paccheri lisci

| Stage | Value |
|-------|-------|
| **Before (raw)** | `De Cecco - Paccheri Lisci Nr. 125 - 500g Produto de Stock` |
| **After (cleaned)** | `De Cecco - Paccheri Lisci Nr. 125 - 500g` |
| **Canonical suggestion** | `Paccheri lisci` |

## Rigamonti bresaola punta d'anca oro 1/2

| Stage | Value |
|-------|-------|
| **Before (raw)** | `Rigamonti - Bresaola Punta d'Anca Oro 1/2 Produto de Stock` |
| **After (cleaned)** | `Rigamonti - Bresaola Punta d'Anca Oro 1/2` |
| **Display** | `Rigamonti bresaola punta d'anca oro 1/2` |
| **Canonical suggestion** | `null` (pre-existing; name too long for auto-suggest) — **no `produto de stock`** |

## Rovagnati salame ventricina

| Stage | Value |
|-------|-------|
| **Before (raw)** | `Rovagnati - Salame Ventricina 2,5 Kg Produto de Stock` |
| **After (cleaned)** | `Rovagnati - Salame Ventricina 2,5 Kg` |
| **Canonical suggestion** | `Rovagnati salame ventricina` |

## Sanpellegrino acqua in vitro 75cl 15ud

| Stage | Value |
|-------|-------|
| **Before (raw)** | `SanPellegrino - Acqua in vitro 75cl x 15ud Produto de Stock` |
| **After (cleaned)** | `SanPellegrino - Acqua in vitro 75cl x 15ud` |
| **Canonical suggestion** | `Sanpellegrino acqua in vitro 75cl 15ud` |

## Contaminated input without upstream clean (defense in depth)

When `buildCanonicalIngredientCreateDefaults` receives contaminated raw text directly (test scenario):

| Input | `suggestedCanonicalName` |
|-------|--------------------------|
| `SanPellegrino - Acqua in vitro 75cl x 15ud Produto de Stock` | `Sanpellegrino acqua in vitro 75cl 15ud` (phrase stripped via `CATALOG_NOISE_PHRASES`) |
