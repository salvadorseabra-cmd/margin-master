# Canonical merge — DB persistence inspection (óleo girassol)

**Date:** 2026-05-21  
**Workspace:** `margin-master`  
**Auth:** `.env` `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), same tenant as app.

## User-reported duplicate

- Óleo girassol fula 1L  
- Óleo girassol 1L  

## Scripts run

```bash
npx vite-node scripts/diagnose-canonical-merge-archive.mts "girassol"
npx vite-node scripts/diagnose-canonical-merge-archive.mts "fula"
npx vite-node scripts/diagnose-canonical-merge-archive.mts "oleo girassol"
```

Additional read-only probe: full `ingredients` rows for `girassol`, `loadCanonicalIngredientCatalog` comparison, alias rows, RLS noop-update probe.

## Merge archive UPDATE (code)

`archiveMergedIngredients` in `src/lib/ingredient-merge.ts` updates the **`ingredients` root table** (not only `ingredient_aliases`):

```ts
await client.from("ingredients").update({
  is_archived: true,
  merged_into_ingredient_id: plan.canonicalIngredientId,
  merged_at: mergedAt,
}).in("id", plan.sourceIngredientIds).select("id, is_archived, merged_into_ingredient_id");
```

`executeIngredientMerge` order: reassign FKs (`ingredient_aliases`, `recipe_ingredients`, …) → then archive sources.

**Note:** No `user_id` filter on archive; RLS is expected to scope by session. Anon key probe: noop `update` on a real girassol id returned **1 row** (updates allowed). Fake id returned **0 rows**, no error.

**Fix applied (data layer):** If `.select()` after update omits any `sourceIngredientIds`, merge now returns `PostgrestError` `archive_update_incomplete` instead of logging only and returning success (previously swallowed partial archive failure).

## Catalog loader vs DB

- `loadCanonicalIngredientCatalog` → `loadActiveIngredientCatalog` with tier `with_kind_and_archive`, server filter `.eq("is_archived", false).is("merged_into_ingredient_id", null)`, then `filterCanonicalCatalogIngredients`.
- Ingredients UI (`src/routes/ingredients.tsx`) uses **only** `loadCanonicalIngredientCatalog` — single table source, no second list table.

## Persisted óleo / girassol rows (Supabase `ingredients`)

| Display / DB name | id | is_archived | merged_into_ingredient_id | ingredient_kind | user_id | created_at | In canonical loader? |
|---|---|---:|---|---|---|---|---|
| ÓLEO GIRASSOL FULA 1L | `91b576c7-9461-4693-98b1-42885593fe44` | **false** | null | canonical | `6b9fc0cf-6b28-4154-becf-99aadb7584b9` | null | yes |
| ÓLEO GIRASSOL 10L | `cfdbaa69-8df7-4426-aed0-d10995b8392d` | **false** | null | canonical | `6b9fc0cf-6b28-4154-becf-99aadb7584b9` | null | yes |
| ÓLEO GIRASSOL OLIVEIRA DA SERRA 1L | `2f5eacd4-32f4-4462-8485-c7eb2fd7a852` | **false** | null | canonical | `6b9fc0cf-6b28-4154-becf-99aadb7584b9` | null | yes |

**There is no row named `ÓLEO GIRASSOL 1L` in the database.** The likely UI counterpart to “óleo girassol 1L” is **`ÓLEO GIRASSOL 10L`** (title-cased in UI as “Óleo Girassol 10l”) or the separate **Oliveira da Serra 1L** SKU.

- Zero archived girassol rows (`is_archived = true` with girassol in name).  
- Zero rows with `merged_into_ingredient_id` pointing at the three ids above.  
- Zero `ingredient_aliases` rows for these three ids (alias cleanup alone would not remove duplicate canonicals).

Loader output for girassol **matches** raw DB active flags (no archived leak).

## Decision tree (findings)

| # | Hypothesis | Result |
|---|------------|--------|
| 1 | Both active in DB because merge never archived / wrong ids | **Confirmed** — all relevant rows `is_archived=false`, `merged_into_ingredient_id=null`; no merge footprint. |
| 2 | Archived in DB but loader shows them | **Rejected** — loader and DB agree. |
| 3 | Two active canonicals; user only cleared aliases | **Plausible** — no aliases on these ids; duplicates are separate canonical SKUs. |
| 4 | Multiple tables feeding Ingredients list | **Rejected** — single `loadCanonicalIngredientCatalog` path. |

## Root cause

**Two (or three) distinct active canonical `ingredients` rows were never soft-archived by a completed canonical merge.** Persistence is consistent with the UI: the data layer is not hiding archived rows. The reported pair is probably **FULA 1L** vs **GIRASSOL 10L** (not a missing “1L” row) — different pack sizes/brands, so automatic operational-dedupe clusters may not treat them as one cluster unless the user runs **manual canonical merge** (source → target) in `manual-canonical-merge-dialog`.

If the user believed merge already ran: either merge was not executed for these ids, failed before archive (check browser console for `[manual_canonical_merge_complete]` / `archive_update_incomplete`), or only invoice alias memory was cleared.

## Recommendations

1. **Merge for real:** In Manual canonical merge, pick **source** = row to retire (e.g. FULA 1L), **target** = canonical to keep (e.g. GIRASSOL 10L if that is the intended anchor). Confirm success log shows `archivedSourceIds` containing the source uuid.
2. **Verify after merge:** Re-run `npx vite-node scripts/diagnose-canonical-merge-archive.mts "girassol"` — expect one active girassol canonical and source row `is_archived=true` with `merged_into_ingredient_id` set.
3. **Do not expect alias-only cleanup** to remove duplicate catalog lines; aliases on these ids are already empty.
4. **Optional product note:** Consider UX copy that 10L vs 1L SKUs are different products unless explicitly merged.

## RLS / archive visibility

- Migration columns present: `is_archived`, `ingredient_kind` (probe OK).  
- Catalog uses `with_kind_and_archive` tier with server-side active filter.  
- Incomplete archive updates now surface as merge errors (see fix above).
