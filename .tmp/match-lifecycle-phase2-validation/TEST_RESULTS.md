# Phase 2 Test Results

**Executed:** 2026-06-14

## Command

```bash
npm test -- src/lib/invoice-item-match-helpers.test.ts \
              src/lib/invoice-item-match-shadow-seed.test.ts \
              src/lib/invoice-item-match-repository.test.ts
```

## Result

```
Test Files  3 passed (3)
Tests       28 passed (28)
Duration    ~1s
```

## Coverage by area

| File | Tests | Focus |
|------|------:|-------|
| `invoice-item-match-helpers.test.ts` | 15 | Status validation, `mapMatcherOutputToInitialMatchRecord`, conservative `resolvePersistedMatchStatusFromMatcher` |
| `invoice-item-match-shadow-seed.test.ts` | 7 | Unmatched / suggested / confirmed seed, coverage report, extract flag gate, idempotent upsert |
| `invoice-item-match-repository.test.ts` | 6 | get / upsert / update (Phase 0) |

## Key scenarios verified

- **Unmatched:** null matcher → `status=unmatched`, `ingredient_id=null`
- **Suggested:** Pepino line → `status=suggested` (operational-memory / exact paths)
- **Confirmed:** Tomate cherry + alias map → `status=confirmed`, `match_kind=confirmed-alias`
- **Idempotent backfill:** two sequential upserts with fixed `now` → identical payloads
- **Flag gate:** shadow extract hook returns null when `VITE_MATCH_LIFECYCLE_SHADOW_SEED` disabled

## Not run (manual / env-dependent)

- Live Supabase backfill dry-run against VL (`SUPABASE_SERVICE_ROLE_KEY` required)
- `scripts/vl-cleanup-investigation.mts` re-read
- Full `npm test` suite
