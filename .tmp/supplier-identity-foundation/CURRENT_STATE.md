# Current State — Supplier Identity Normalization

**Date:** 2026-06-16

## Core module: `src/lib/supplier-identity.ts`

| Function | Purpose |
|---|---|
| `normalizeSupplierDisplayName` | Human-readable supplier label for UI and DB writes |
| `normalizeSupplierKey` | **NEW** — deterministic lowercase identity key for lookups/aggregation |
| `looksLikeUploadedFileName` | Detect filename-as-supplier fallback |
| `normalizeInvoiceNumber` / `normalizeInvoiceDate` | Invoice metadata (unchanged) |

### Shared preprocessing (`prepareSupplierNameValue`)

Both display and key paths share:

1. Strip file extension
2. Collapse whitespace / underscores
3. `trimCompanyDescriptor` — take segment before ` - ` when present
4. `stripLegalSuffixes` — remove LDA, SA, Unipessoal, Limitada, etc.
5. Trim trailing punctuation

### Display path (`normalizeSupplierDisplayName`)

- Applies `tidyCapitalization` — title-cases ALL-CAPS tokens (fix: no longer preserves `AVILUDO` as-is)
- Preserves already mixed-case strings (e.g. `Bidfood Portugal`)

### Key path (`normalizeSupplierKey`)

- Same preprocessing → `toLocaleLowerCase()`
- Typo map: `avijudo` → `aviludo` (VL-proven OCR typo only)

## Write paths (supplier_name SET)

| Location | Normalization applied | Notes |
|---|---|---|
| `invoices.tsx` `uploadOne` insert | Filename fallback (raw) | Overwritten after extraction |
| `invoices.tsx` `uploadOne` update | `normalizeSupplierDisplayName` via `runExtraction` | `ext?.supplier?.slice(0,120)` |
| `invoices.tsx` `reExtract` update | Same as upload | |
| `invoices.tsx` `runExtraction` | `normalizeSupplierDisplayName(data?.supplier)` | Also used for price-history sync |
| `ingredient-alias-memory.ts` `upsertConfirmedAlias` | `normalizeSupplierDisplayName` via `normalizeSupplierScope` | DB `ingredient_aliases.supplier_name` |

## Lookup / aggregation paths (wired this change)

| Location | Uses | Notes |
|---|---|---|
| `ingredient-alias-lookup.ts` `buildIngredientAliasLookupKey` | **key** | `aviludo::alias` unifies AVILUDO/Aviludo/Avijudo |
| `ingredient-alias-fuzzy-lookup.ts` | **key** | Supplier-scoped fuzzy recovery |
| `operational-intelligence-view.ts` `buildSupplierWatchlist` | **key** + display | Merges casing variants; prefers title-cased label |

## Lookup paths still on display name (intentional)

| Location | Uses | Reason |
|---|---|---|
| `ingredient-alias-memory.ts` DB dedup query | display | `eq("supplier_name", …)` matches stored rows |
| `ingredient-match-override.ts` `invoiceSupplierNormalized` | display | Trace metadata only |
| `ingredient-operational-intelligence.ts` | display | Supplier comparison in intelligence views |
| `catalog-review-current-matches.ts` | display | Display scope |
| `ingredient-rejected-match-memory.ts` | display | Session rejection keys |
| `pricing-source-presentation.ts` | display | UI label |

## Pre-change pain points (VL audit)

- No `supplier_id` — denormalized text only
- Aviludo split: `AVILUDO`, `Aviludo`, `Avijudo` across invoices + aliases
- Alias lookup keys were case-sensitive on display name
- Watchlist used `toLowerCase()` — merged casing but not Avijudo typo
- `titleCaseWord` preserved ALL-CAPS tokens → `AVILUDO` stayed uppercase in display

## Post-change foundation

- **Display writes** → `normalizeSupplierDisplayName` (new extractions get `Aviludo`, not `AVILUDO`)
- **In-memory alias keys** → `normalizeSupplierKey` (cross-spelling hits without DB backfill)
- **Watchlist aggregation** → `normalizeSupplierKey` (Aviludo cluster unified in UI)
