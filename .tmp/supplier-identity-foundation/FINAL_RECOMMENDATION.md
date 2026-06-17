# Final Recommendation — Supplier Identity Foundation

**Date:** 2026-06-16  
**Status:** Foundation implemented; **READY_FOR_BACKFILL**

## What was delivered

1. **`normalizeSupplierKey()`** — shared preprocessing + lowercase + `avijudo→aviludo` typo map
2. **Improved `normalizeSupplierDisplayName()`** — title-cases ALL-CAPS tokens; legal suffix strip unchanged
3. **Wired KEY into:**
   - `buildIngredientAliasLookupKey` (via `ingredient-alias-lookup.ts`)
   - `fuzzyLookupIngredientIdFromAliasMap` supplier scope
   - `buildSupplierWatchlist` aggregation + display pick
4. **Tests** — `supplier-identity.test.ts` + updated alias tests (33 passing)
5. **Audit docs** — CURRENT_STATE, USAGE_MATRIX, IMPACT_ANALYSIS, TEST_RESULTS

## Normalization rules (authoritative)

| Input | Display | Key |
|---|---|---|
| `AVILUDO` | `Aviludo` | `aviludo` |
| `Aviludo` | `Aviludo` | `aviludo` |
| `Avijudo` | `Avijudo` | `aviludo` |
| `IL BOCCONCINO DISTRIBUIÇÃO ALIMENTAR` | `Il Bocconcino Distribuição Alimentar` | `il bocconcino distribuição alimentar` |
| `Bidfood Portugal, SA` | `Bidfood Portugal` | `bidfood portugal` |

## Out of scope (honored)

- No schema / migrations / supplier table
- No matching, canonical, or pricing logic changes
- No historical backfill
- No new typo maps beyond `avijudo`

## Next step: backfill (separate task)

1. Update `invoices.supplier_name` → DISPLAY canonical (VL est. 2–4 rows)
2. Update `ingredient_aliases.supplier_name` → DISPLAY canonical (VL est. 3+ rows)
3. Update `ingredient_price_history.supplier_name` where Aviludo variants exist
4. Optionally wire KEY into `operational-intelligence-synthesis` spend filters

## Risks

| Risk | Level | Notes |
|---|---|---|
| Historical UI shows old casing | Low | Expected until backfill |
| DB alias dedup across spellings | Medium | In-memory lookup fixed; DB dedup needs backfill |
| Over-broad typo map | None | Single proven entry only |
| SA stripped from legitimate name | Low | Existing LEGAL_SUFFIX_RE behavior preserved |

## Verdict

**READY_FOR_BACKFILL** — foundation is safe for new writes and in-memory identity unification. Historical denormalized strings remain the only source of fragmentation in DB-backed views and spend synthesis.
