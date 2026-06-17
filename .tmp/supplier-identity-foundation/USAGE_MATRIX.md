# Usage Matrix — Supplier Identity

**Date:** 2026-06-16

Legend: **KEY** = `normalizeSupplierKey`, **DISPLAY** = `normalizeSupplierDisplayName`, **RAW** = stored/trimmed as-is

## Write paths — use DISPLAY

| File | Function / site | Current | Should use | Changed? |
|---|---|---|---|---|
| `invoices.tsx` | `runExtraction` → return supplier | DISPLAY | DISPLAY | No (already) |
| `invoices.tsx` | `uploadOne` invoice update | DISPLAY via extraction | DISPLAY | No |
| `invoices.tsx` | `reExtract` invoice update | DISPLAY via extraction | DISPLAY | No |
| `invoices.tsx` | initial insert fallback | RAW filename | DISPLAY optional | No — overwritten on extract |
| `ingredient-alias-memory.ts` | `upsertConfirmedAlias` insert/update | DISPLAY | DISPLAY | No |
| `ingredient-price-history.ts` | history row insert | RAW param | DISPLAY at call site | No — callers pass DISPLAY |

## Lookup / aggregation — use KEY

| File | Function / site | Current | Should use | Changed? |
|---|---|---|---|---|
| `ingredient-alias-lookup.ts` | `normalizeSupplierScope` | KEY | KEY | **Yes** |
| `ingredient-alias-lookup.ts` | `buildIngredientAliasLookupKey` | KEY (via scope) | KEY | **Yes** |
| `ingredient-alias-fuzzy-lookup.ts` | supplier scope filter | KEY | KEY | **Yes** |
| `operational-intelligence-view.ts` | `buildSupplierWatchlist` map key | KEY | KEY | **Yes** |
| `operational-intelligence-view.ts` | watchlist alert merge key | KEY | KEY | **Yes** |

## Display / UI — use DISPLAY or RAW

| File | Site | Current | Should use | Changed? |
|---|---|---|---|---|
| `invoices.tsx` | invoice list cell | RAW from DB | RAW (historical) / DISPLAY (new writes) | No |
| `invoices.tsx` | supplier filter `toLowerCase()` | lowercase RAW | KEY (future) | No — trace only |
| `pricing-source-presentation.ts` | price source label | DISPLAY | DISPLAY | No |
| `ingredient-purchase-memory.ts` | purchase memory label | DISPLAY | DISPLAY | No |
| `operational-intelligence-view.ts` | watchlist `supplierName` field | DISPLAY preferred | DISPLAY | **Yes** (display pick) |
| `operational-intelligence-synthesis.ts` | spend filters `trim() ===` | RAW | KEY (future backfill) | No |
| `margin-alert-data.ts` | supplier grouping | RAW trim | KEY (future) | No |
| `margin-alerts.ts` | price window by supplier | RAW trim | KEY (future) | No |
| `invoice-kpi-summary.ts` | supplier count | RAW | KEY (future) | No |

## DB equality / dedup — use DISPLAY (stored value)

| File | Site | Notes |
|---|---|---|
| `ingredient-alias-memory.ts` | `existingAliasQuery.eq("supplier_name")` | Must match what was written; old `Avijudo` rows won't dedupe with new `Aviludo` until backfill |
| `ingredient-alias-reassignment.ts` | `aliasReassignmentOwnershipKey` | Uses `buildIngredientAliasLookupKey` → KEY for in-memory; DB ops use stored display |

## Intelligence / matching — unchanged (out of scope)

| File | Site | Notes |
|---|---|---|
| `ingredient-operational-intelligence.ts` | supplier scope comparisons | DISPLAY — not changed per constraint |
| `ingredient-match-override.ts` | override keys | Lookup key via alias module uses KEY; trace field stays DISPLAY |
| `catalog-review-current-matches.ts` | scan display | DISPLAY |
| `ingredient-rejected-match-memory.ts` | rejection scope | DISPLAY — session-local |
| Canonical / pricing / matching pipelines | — | **Not touched** |

## Edge functions

| File | Site | Notes |
|---|---|---|
| `extract-invoice/invoice-metadata-extraction.ts` | raw OCR supplier | No server normalization; client DISPLAY on persist |

## Recommended future wiring (post-backfill)

1. `operational-intelligence-synthesis.ts` supplier spend filters → KEY
2. `invoices.tsx` supplier name filter → KEY
3. `margin-alert-data.ts` supplier rollups → KEY
4. DB dedup: migrate `ingredient_aliases.supplier_name` to DISPLAY canonical, add optional `supplier_key` column only if product needs it (out of current scope)
