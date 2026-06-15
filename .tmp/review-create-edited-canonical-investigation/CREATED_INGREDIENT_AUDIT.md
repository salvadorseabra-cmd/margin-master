# Created Ingredient Audit

**Date:** 2026-06-15

---

## DB accessibility

- Storage: Supabase (no local SQLite)
- **This session:** Live DB not queried
- **Prior VL snapshot** (~2026-06-11): all 7 Bocconcino lines unmatched, no ingredient IDs — predates user's Review & Create session

---

## Relevant invoice item IDs

| Product | Item ID |
|---------|---------|
| Stracciatella | `abab22b0-6c2e-4505-beb9-877c3be9acd4` |
| Mezzi paccheri | `2a6228eb-2c77-4fae-b59a-a4bace19c5d3` |

---

## Repo search

- No seed rows for Stracciatella / Mezzi paccheri in migrations or fixtures
- No committed DB dump with created ingredient names

---

## Expected DB state

| Scenario | ingredients.name |
|----------|------------------|
| Edits **not** persisted | `Stracciatella 250gr`, `Mezzi paccheri mancini` |
| Edits **did** persist | `Stracciatella`, `Mezzi paccheri` |

---

## Verification queries (live DB)

```sql
SELECT id, name, normalized_name, created_at, source
FROM ingredients
WHERE name ILIKE '%stracciatella%' OR name ILIKE '%paccheri%'
ORDER BY created_at DESC;
```

Also check `ingredient_aliases` and `invoice_item_matches` for the item IDs above.
