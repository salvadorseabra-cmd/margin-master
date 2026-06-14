# Pepino Reassign Validation (conserva → fresco)

**Status: NOT YET TESTABLE from current baseline**

## Why not testable

- Pepino line is already **unmatched** (post-unmatch baseline)
- **Pepino fresco** does not exist in the catalog
- Reassign requires an active confirmed match to conserva as the starting point

## Prerequisite setup

1. Open Bidfood invoice → Pepino line
2. **Confirm/correct match to Pepino conserva** (re-establish contamination OR use a fresh re-extract without unmatch)
3. **Create "Pepino fresco"** ingredient (kg) — does not exist in catalog
4. Correct match: conserva → Pepino fresco

## Expected (Phase 5B subtractive)

| Surface | Expected |
|---------|----------|
| `invoice_item_matches` | `ingredient_id` = fresco, `previous_ingredient_id` = conserva |
| Conserva history | No Bidfood row; jar rows retained |
| Fresco history | New row for Bidfood invoice |
| Conserva current_price | Reverted to jar chain |
| Reject pair | conserva blocked — **UNVERIFIED** (localStorage) |

## Baseline facts (2026-06-14)

| Fact | Value |
|------|-------|
| Current Pepino item | aca361a1-ad60-43fa-9cc4-1345b7d45af3 |
| Match status | unmatched |
| Conserva ID | 635a1189-36ea-4ff2-9012-8172ab1ab81d |
| Pepino fresco in catalog | **none** |
| Bidfood conserva history | **none** |

## Post-step re-query checklist

```sql
-- Match points to fresco
SELECT ingredient_id, previous_ingredient_id, status, corrected_at
FROM invoice_item_matches
WHERE invoice_item_id = 'aca361a1-ad60-43fa-9cc4-1345b7d45af3';

-- No conserva Bidfood history
SELECT * FROM ingredient_price_history
WHERE ingredient_id = '635a1189-36ea-4ff2-9012-8172ab1ab81d'
  AND invoice_id = 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e';

-- Fresco has Bidfood history
SELECT * FROM ingredient_price_history
WHERE invoice_id = 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e'
  AND ingredient_id = '<fresco_id>';
```

## Runnable re-query

```bash
npx vite-node scripts/validate-pepino-lifecycle.mts after-step
```
