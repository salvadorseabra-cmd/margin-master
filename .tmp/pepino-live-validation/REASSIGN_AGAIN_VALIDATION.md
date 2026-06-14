# Pepino Reassign Again Validation (fresco → conserva)

**Status: PENDING** (depends on REASSIGN)

## Dependency

Cannot run until **REASSIGN_VALIDATION** completes successfully (conserva → fresco).

## Workflow

```
Pepino → conserva (confirmed) → fresco (reassign #1) → conserva (reassign #2)
```

## Expected

| Check | Expected |
|-------|----------|
| Match | `ingredient_id` = conserva, `previous_ingredient_id` = fresco |
| Fresco history | Bidfood row **deleted** |
| Conserva history | Bidfood row **re-created** (forward write) |
| Double attribution | **None** — only one ingredient owns Bidfood history at a time |

## Post-step checklist

Same queries as REASSIGN, plus verify single `(invoice_id, ingredient_id)` ownership in `ingredient_price_history`:

```sql
-- Match back to conserva
SELECT ingredient_id, previous_ingredient_id, status, corrected_at
FROM invoice_item_matches
WHERE invoice_item_id = 'aca361a1-ad60-43fa-9cc4-1345b7d45af3';

-- Single ownership: at most one row per (invoice_id, ingredient_id) for Bidfood
SELECT ingredient_id, COUNT(*) AS row_count
FROM ingredient_price_history
WHERE invoice_id = 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e'
GROUP BY ingredient_id;

-- Fresco Bidfood history should be gone
SELECT * FROM ingredient_price_history
WHERE invoice_id = 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e'
  AND ingredient_id = '<fresco_id>';

-- Conserva Bidfood history should exist again
SELECT * FROM ingredient_price_history
WHERE ingredient_id = '635a1189-36ea-4ff2-9012-8172ab1ab81d'
  AND invoice_id = 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e';
```

## Runnable re-query

```bash
npx vite-node scripts/validate-pepino-lifecycle.mts after-step
```
