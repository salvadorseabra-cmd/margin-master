# Model D Implementation Report

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** implementation validation (no deploy, no commit)

## Verdict: **PASS**

Operational Identity Model D is implemented on the shared alias spine. Prosciutto recovers via operational-identity lookup; known products unchanged; zero regressions on the VL corpus.

---

## Architecture (3 layers)

| Layer | Role | Mutable? |
|-------|------|----------|
| Raw invoice name | Evidence (`alias_name`, `invoice_items.name`) | Stored as-is |
| Operational identity | Matching (`buildOperationalIdentityAliasKey`) | Derived; brand-prefix strip |
| Canonical ingredient | Catalog (`ingredients`) | **Unchanged** |

---

## Files changed

| File | Change |
|------|--------|
| `canonical-ingredient-display-name.ts` | Export `stripInvoiceBrandPrefix` |
| `ingredient-operational-alias-memory.ts` | Add `buildOperationalIdentityAliasKey` |
| `ingredient-match-override.ts` | Dual keys on `buildOverrideKeysFromInvoiceLine`; dual override lookup |
| `ingredient-alias-lookup.ts` | Dual key lookup in `lookupIngredientIdFromAliasMap` |
| `ingredient-alias-memory.ts` | `resolveNormalizedAliasFromConfirmedRow` prefers operational identity; `upsertConfirmedAliasDualIdentity` |
| `ingredient-correction-memory.ts` | Dual in-memory + DB write on manual confirm |
| `ingredient-match-alias-memory.ts` | Dual write on auto alias persist |
| `ingredient-model-d.test.ts` | New Model D unit tests |

**Not changed:** canonical names, ingredient IDs, recipes, supplier intelligence, pricing, procurement, review framework, match thresholds, semantic scoring.

---

## Read path

1. `buildOverrideKeysFromInvoiceLine` returns **raw** key (legacy) + **operational identity** key (brand prefix stripped via `INVOICE_BRAND_PREFIX_STRIP_RE`).
2. `lookupIngredientMatchOverride` / `lookupIngredientIdFromAliasMap` try both key sets (supplier-scoped + global).
3. `resolveNormalizedAliasFromConfirmedRow` re-derives operational identity from `alias_name` when rebuilding alias map.
4. Semantic matching unchanged.

**Beverage exclusion:** San Pellegrino, Coca Cola, Pepsi not in strip regex — operational key equals raw key.

---

## Write path

`upsertConfirmedAliasDualIdentity` (used by `persistManualIngredientCorrection` and `persistInvoiceLineAliasMemory`):

1. Upsert raw normalized alias (existing behavior).
2. When operational identity differs, upsert second row with same `alias_name` and operational `normalized_alias`.
3. `releaseStaleAliasOwnership` runs per key — no duplicate ownership.

---

## Validation matrix (VL corpus)

| Product | Alias hit | Ingredient ID unchanged | Notes |
|---------|-----------|---------------------------|-------|
| **Prosciutto** | **Yes** | Yes | **Recovered** — was suggested, now alias-confirmed |
| Mortadella | Yes | Yes | Prefix stripped; same ID |
| Bresaola | Yes | Yes | Prefix stripped; same ID |
| Gorgonzola | Yes | Yes | Arrigoni prefix stripped; same ID |
| Paccheri | Yes | Yes | De Cecco prefix stripped; same ID |
| Chocolate | Yes | Yes | No prefix |
| Atum | Yes | Yes | No prefix |
| Mozzarella | Yes | Yes | No prefix |
| Pepino | Yes | Yes | No prefix |
| San Pellegrino | Yes | Yes | Beverage brand preserved |

---

## Blast radius

**LOW** — 1 material improvement (Prosciutto), 0 regressions, 0 ingredient_id changes on VL replay.

**Pre-existing data issue (not introduced):** 1 mozzarella julienne ownership collision in VL DB (`2a99cecd` vs `5e9e7f89` on same operational key). `releaseStaleAliasOwnership` resolves this on next confirm.

---

## Tests

```
npm test -- src/lib/ingredient-model-d.test.ts \
  src/lib/ingredient-alias-memory.test.ts \
  src/lib/ingredient-match-override.test.ts \
  src/lib/ingredient-alias-lookup.test.ts \
  src/lib/ingredient-operational-alias-memory.test.ts
```

**48/48 passed**

Replay (production code paths against VL):

```
npx vite-node .tmp/model-d-implementation/replay.mts
```

See `.tmp/model-d-implementation/results.json` for full row-level output.

---

## PASS / FAIL criteria

| Criterion | Result |
|-----------|--------|
| Prosciutto AUTO MATCH via alias | **PASS** |
| Known products unchanged | **PASS** |
| No ingredient_id changes | **PASS** |
| No new regressions | **PASS** (0) |
| Unit tests | **PASS** (48/48) |
| Pre-existing DB collision cleanup | **N/A** (mozzarella julienne — pre-deploy) |

**Overall: PASS**
