# Canonical duplicate trace (`[canonical_name_source]` / `[canonical_duplicate_detected]`)

Instrumentation only — no matching or cleanup heuristics changed. Filter DevTools console in **DEV**.

## Log prefixes

| Prefix | When |
|--------|------|
| `[canonical_name_source]` | How `ingredients.name` / dialog default was chosen |
| `[canonical_duplicate_detected]` | Guard reuse, or near-duplicate cluster on catalog load |
| `[canonical_create_attempt]` | Insert path entered / blocked / attempted |
| `[canonical_create_source]` | Legacy alias of `[canonical_name_source]` (same payload) |

### Shared fields

Each structured log includes:

- `flowFunction` — caller (e.g. `buildExplicitCanonicalInsertPayload`, `guardIngredientCreation`)
- `flowOrigin` — `explicit_user` \| `manual_form` \| `auto_persist` \| `unknown`
- `rawInvoiceText` — invoice line OCR when applicable; `null` on Ingredients form
- `normalized` — matcher/catalog key after normalization
- `finalCanonicalName` — value that would be persisted or shown in dialog
- `nameSource` — `invoice_line` \| `user_canonical` \| `form_input` \| `unknown`
- `insertAttempted` — `true` only when `ingredients.insert` runs

Duplicate logs add `reason`, `existingIngredientId`, `operationalKey`, and optional `clusterMembers`.

## Óleo girassol case (packaging / brand aliases)

Example duplicates: **Óleo girassol**, **Óleo girassol fula 1L**, **Óleo girassol 1L**.

### Name sources (no auto-create from alias)

| Step | Function | `nameSource` | Result |
|------|----------|--------------|--------|
| Invoice line | `item.name` | — | Raw alias (e.g. `OLEO GIRASSOL FULA 1L`) |
| Dialog default | `buildCanonicalIngredientCreateDefaults` | cleaned suggestion | `suggestCanonicalIngredientIdentityName` → `cleanCanonicalIngredientNameForCatalog` strips bulk **10L**; **1L** kept (&lt;2L serving); **fula** not in noise list → may remain |
| User confirms | `buildExplicitCanonicalInsertPayload` | `user_canonical` | `buildCatalogIngredientIdentity(user input)` → persisted `name` + `normalized_name` |
| Legacy helper | `buildIngredientInsertPayload` | `invoice_line` | Sets `name` = invoice text — **insert blocked** unless `source: explicit_user` |

**Auto-create is not guilty:** `persistIngredientFromInvoiceItem` returns `blocked: true` for any `source !== "explicit_user"`. `autoPersistUnmatchedInvoiceItems` never inserts canonical rows.

Duplicates arise when the user (or manual form) confirms **different** canonical strings that survive cleanup with distinct `normalized_name` / operational keys:

- `cleanCanonicalIngredientNameForCatalog("Óleo girassol 10l")` → `Óleo girassol`
- `cleanCanonicalIngredientNameForCatalog("Óleo girassol fula 1L")` → `Óleo girassol fula 1L` (brand **fula** kept; **1L** kept as serving format)
- `guardIngredientCreation("Óleo girassol fula 1L")` vs catalog `Óleo girassol` → **create** (keys differ: `oleo girassol fula 1l` vs `oleo girassol`)

Invoice **matching** can still map aliases to one catalog row (`findCanonicalIngredientMatch`); that does not merge separate canonical rows.

### Duplicate detection false negatives

| Check | Catches óleo girassol variants? |
|-------|----------------------------------|
| `catalogHasDuplicateDisplayName` | Only exact display match (case-insensitive) |
| `findCatalogIngredientByOperationalKey` | Uses `normalizeCatalogOperationalIdentityKey` on **proposed display name**, not cleaned catalog identity — `1L` / `fula` tokens prevent reuse |
| `detectNearDuplicateCanonicalClusters` (load) | Flags rows sharing **cleaned** normalized key (`oleo girassol`) but different stored names/operational keys |

## Where logs fire

| Location | Logs |
|----------|------|
| `buildCanonicalIngredientCreateDefaults` | `[canonical_name_source]` dialog-defaults |
| `buildExplicitCanonicalInsertPayload` | name-source + `[canonical_create_attempt]` |
| `buildIngredientInsertPayload` | `[canonical_name_source]` `invoice-line-as-name` |
| `persistIngredientFromInvoiceItem` | attempt + insert |
| `guardIngredientCreation` | name-source guard-enter; duplicate on reuse |
| `IngredientsPage.saveNewIngredient` | manual_form name-source + attempt |
| `saveCanonicalIngredientFromInvoice` | guard with `rawInvoiceText: item.name` |
| `loadCanonicalIngredientCatalog` | `[canonical_duplicate_detected]` clusters after filter |

## Reproduce

1. `npm run dev` → Console → filter `[canonical_name_source]` or `[canonical_duplicate_detected]`.
2. Open **Ingredients** — cluster summary if DB has near-duplicates.
3. Invoice line → **Create ingredient** — watch `dialog-defaults` then `buildExplicitCanonicalInsertPayload` → guard → insert or reuse.

## Related

- `docs/catalog-leak-trace.md` — shorthand pollution on load
- `docs/ingredient-alias-trace-repro.md` — alias memory inserts
