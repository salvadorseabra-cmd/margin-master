# Catalog pollution investigation (`[catalog_pollution_row]`)

Instrumentation-only investigation for alias/OCR rows appearing in the canonical ingredient catalog load path. **No matching, cleanup, or filter logic was changed.**

## Symptom

DevTools shows:

```
[catalog_leak] legacy-pollution-detected
  context: "loadCanonicalIngredientCatalog:before-filter"
```

Companion structured log: `[catalog_leak_detected] legacy-pollution-detected`.

Per-row detail (new): `[catalog_pollution_row]` — one log per polluted active row.

## Data source

`loadCanonicalIngredientCatalog` → `loadActiveIngredientCatalog` → Supabase:

```sql
SELECT id, name, normalized_name, unit, ingredient_kind, is_archived, merged_into_ingredient_id
FROM public.ingredients
```

(with graceful fallback when archive/kind columns are missing).

Pollution is detected on **active** rows **before** `filterCanonicalCatalogIngredients` runs.

## What `detectCatalogLeakRows` flags

| `leakReason` | Condition | Example row shape |
|--------------|-----------|-------------------|
| `explicit_alias_kind` | `ingredient_kind === 'alias'` | `{ id, name: "BAC FUM FAT", ingredient_kind: "alias", normalized_name: "bac fum fat" }` |
| `legacy_canonical_shorthand` | `ingredient_kind === 'canonical'` **and** `looksLikeInvoiceShorthandName(name)` | `{ id, name: "CHK BREADED", ingredient_kind: "canonical" }` |
| `invoice_shorthand_name` | Shorthand name, kind not explicitly `canonical` | Pre-migration rows without kind column; inferred alias from name |

**Not flagged by `detectCatalogLeakRows`:** rows that pass `isCanonicalIngredientEntry` (human catalog filter). Near-duplicate canonical clusters are a separate diagnostic (`[canonical_duplicate_detected]`).

### `isCanonicalIngredientEntry` vs leak detection

- **Filter (UI):** `isCanonicalIngredientEntry` → false for explicit alias **or** shorthand display names.
- **Leak log:** `detectCatalogLeakRows` also reports explicit `alias` kind rows even though they would already be filtered — so operators see **all** DB pollution, not only shorthand-with-canonical-kind.

## Are aliases written directly to `ingredients`?

**Current code — no for new alias memory:**

| Store | Table | Purpose |
|-------|-------|---------|
| Alias memory | `ingredient_aliases` | Maps invoice wording → `ingredient_id` |
| Invoice state | `invoice_items` (UI) | Unmatched OCR lines |
| Catalog | `ingredients` | Canonical entities only |

`ingredient_aliases.insert` is used from match/rematch/correction flows. **`ingredients.insert` today:**

1. `persistIngredientFromInvoiceItem` — only when `source === "explicit_user"`; blocks shorthand names.
2. `IngredientsPage.saveNewIngredient` — manual form; `ingredient_kind: canonical`.

**Historical pollution vectors (pre-guard):**

1. **Auto-persist** — `buildIngredientInsertPayload` copied **invoice line text** into `name` / `normalized_name` with `ingredient_kind: canonical`. Auto-insert is now disabled (`autoPersistUnmatchedInvoiceItems` never calls insert).
2. **Explicit create with invoice text** — before `validateCanonicalIngredientName` / `buildCatalogIngredientIdentity`, users could confirm shorthand as catalog name.
3. **Alias rows in `ingredients`** — `ingredient_kind` migration allows `alias`; cleanup/merge can set kind without deleting rows. Archived alias rows may still appear in active load if `is_archived` is false.

There is **no** `created_from_invoice_row` column on `ingredients` in current types; logs emit `"unknown/legacy"`.

## Log format

### `[catalog_pollution_row]` (per row)

```json
{
  "context": "loadCanonicalIngredientCatalog:before-filter",
  "flowFunction": "logCatalogLeakDiagnostics",
  "flowOrigin": "unknown",
  "note": "DB row loaded before catalog filter; pairs with catalog_leak_detected",
  "ingredientId": "…",
  "ingredientName": "CHK BREADED",
  "isCanonical": false,
  "ingredientKind": "canonical",
  "inferredKind": "canonical",
  "leakReason": "legacy_canonical_shorthand",
  "inferredCreationSource": "historical_insert:canonical_kind+invoice_shorthand_name (pre-guard auto-persist or manual)",
  "createdFromInvoiceRow": "unknown/legacy",
  "normalizedName": "chk breaded",
  "looksLikeInvoiceShorthand": true,
  "aliasSourceText": "CHK BREADED"
}
```

### `[catalog_leak_detected]` (summary)

Same as `[catalog_leak]` sample payload, plus `pollutionRows` (up to 12 full diagnostics) and `pollutionRowLogPrefix: "[catalog_pollution_row]"`.

## Reproduce

### Browser (DEV)

1. `npm run dev` → open **Ingredients** or **Invoices**.
2. Console filters: `[catalog_pollution_row]`, `[catalog_leak_detected]`, `[catalog_leak]`.

### Live DB dump (read-only)

```bash
npx vite-node scripts/dump-catalog-pollution.mts
```

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Related instrumentation

| Prefix | When |
|--------|------|
| `[canonical_create_attempt]` | Insert path entered or blocked |
| `[canonical_name_source]` | How `ingredients.name` would be chosen |
| `[unmatched_persist]` | Invoice line skipped (no insert) |
| `[alias_only]` | Alias memory only |
| `[ingredient_aliases_trace]` | `ingredient_aliases` insert failures |

See also `docs/catalog-leak-trace.md`, `docs/canonical-duplicate-trace.md`.
