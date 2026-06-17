# Recommendations — Supplier Catalog Quality

**Date:** 2026-06-15

## A) Display normalization (UI)

- Fold ALL-CAPS supplier tokens to title case (except IL, SA)
- Strip legal suffixes consistently
- Render normalized name in invoice list, watch, history filter

## B) Identity normalization (matching / analytics)

- Add `normalizeSupplierKey()` — lowercase + trim + suffix strip + typo map (`avijudo` → `aviludo`)
- Apply at invoice update, alias upsert, price_history write
- One-time backfill on `invoices`, `ingredient_aliases`, `ingredient_price_history`
- Align `buildSupplierWatchlist` and `buildIngredientAliasLookupKey` on same key function
- Optional future: `suppliers` table with stable UUID + `canonical_key`

## Do not conflate with

Ingredient canonicalization — separate pipeline.

## Immediate actions

1. Fix normalization + typo map
2. Backfill VL data
3. Re-read Emporio (0 line items)
