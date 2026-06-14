# Lookup Flow — Phase 1B Fuzzy Alias Recovery

**Date:** 2026-06-14

## End-to-End Path

```
Invoice line (raw OCR text)
  │
  ▼
normalizeSupplierShorthand()          [ingredient-operational-aliases.ts]
  │
  ▼
normalizeOperationalAliasKey()        [ingredient-operational-alias-memory.ts]
  ├── tokenize → lowercase → strip diacritics
  ├── normalizeBrandToken() — Phase 1 whitespace/OCR split collapse
  ├── preserve product weights / pack formats
  └── compact lookup key (e.g. "filete de anchovas alconfirosa 495")
  │
  ▼
buildOverrideKeysFromInvoiceLine()    [ingredient-match-override.ts]
  ├── rawNormalized: operational alias key
  └── lookupKey: SUPPLIER::rawNormalized
  │
  ▼
findCanonicalIngredientMatch()        [ingredient-canonical.ts]
  │
  ├── 1. lookupIngredientMatchOverride()   — exact in-memory override store
  │       └── same keys from buildOverrideKeysFromInvoiceLine
  │
  ├── 2. resolveOperationalAliasCatalogMatch() — session/static alias memory
  │
  └── 3. lookupIngredientIdFromAliasMap()  — confirmed DB alias map
          │
          ├── Pass A: exact operational keys (supplier + global)
          ├── Pass B: supplier-scoped key (SUPPLIER::normalized)
          ├── Pass C: global normalized key
          │
          └── Pass D: [NEW Phase 1B] supplier-scoped fuzzy fallback
                  └── fuzzyLookupIngredientIdFromAliasMap()
                      ├── extractBrandFingerprint(query)
                      ├── iterate SUPPLIER::* alias entries only
                      ├── product prefix compatibility check
                      ├── levenshtein(fingerprint) ≤ 2
                      ├── group by ingredient_id
                      └── reject if ambiguous across ingredient_ids
```

## Key Functions

| Step | Function | File |
|------|----------|------|
| Normalize | `normalizeOperationalAliasKey` | `ingredient-operational-alias-memory.ts` |
| Build keys | `buildOverrideKeysFromInvoiceLine` | `ingredient-match-override.ts` |
| Override lookup | `lookupIngredientMatchOverride` | `ingredient-match-override.ts` |
| Alias lookup | `lookupIngredientIdFromAliasMap` | `ingredient-alias-lookup.ts` |
| Fuzzy fallback | `fuzzyLookupIngredientIdFromAliasMap` | `ingredient-alias-fuzzy-lookup.ts` |

## Phase 1B Insertion Point

Fuzzy recovery runs **only after all exact-key passes miss** in `lookupIngredientIdFromAliasMap`. It requires a known supplier scope — no global fuzzy fallback.

Dev logging: `[fuzzy-alias-recovery]` with supplier, candidate key, matched key, distance, ingredient id.
