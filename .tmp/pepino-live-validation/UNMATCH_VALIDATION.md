# Pepino Unmatch Validation (conserva cleanup)

**Status: LIKELY ALREADY VALIDATED** (DB evidence)

## Expected (Phase 5)

| Check | Expected |
|-------|----------|
| `invoice_item_matches.status` | `unmatched` |
| `ingredient_id` | `null` |
| `previous_ingredient_id` | conserva ID |
| `corrected_at` | set |
| Poison row `a689bd91` | **deleted** |
| Conserva jar history | retained (2 rows) |
| Bidfood in conserva history | **absent** |
| Reject pair | localStorage — **UNVERIFIED** |

## Baseline result (2026-06-14)

| Check | Actual | Pass? |
|-------|--------|-------|
| status unmatched | ✓ | **PASS** |
| previous_ingredient_id = conserva | ✓ | **PASS** |
| poison deleted | ✓ | **PASS** |
| jar history intact | ✓ (2 rows) | **PASS** |
| no Bidfood history | ✓ | **PASS** |
| reject pair | — | **UNVERIFIED** |

## Evidence summary

- Pepino item: `aca361a1-ad60-43fa-9cc4-1345b7d45af3`
- Unmatch timestamp: `2026-06-14T14:17:26.205Z`
- Conserva `current_price` updated_at matches unmatch timestamp
- Poison row `a689bd91-5b83-41d9-b060-b5a63ccfb3b4`: **0 rows**

## Post-step re-query checklist

```sql
-- Pepino match tombstone
SELECT * FROM invoice_item_matches
WHERE invoice_item_id = 'aca361a1-ad60-43fa-9cc4-1345b7d45af3';

-- Poison gone
SELECT * FROM ingredient_price_history
WHERE id = 'a689bd91-5b83-41d9-b060-b5a63ccfb3b4';

-- Conserva chain jar-only
SELECT id, invoice_id, new_price, created_at
FROM ingredient_price_history
WHERE ingredient_id = '635a1189-36ea-4ff2-9012-8172ab1ab81d'
ORDER BY created_at;
```

## Runnable re-query

```bash
npx vite-node scripts/validate-pepino-lifecycle.mts baseline
```
