# Backfill Plan — `invoice_item_matches` Shadow Seed

## Script

```bash
# Dry-run (no writes) — reports counts and projected status buckets
npm run backfill:invoice-item-matches -- --dry-run

# Apply upserts for all invoice_items
npm run backfill:invoice-item-matches

# Scoped runs
npm run backfill:invoice-item-matches -- --dry-run --invoice-id=<uuid>
npm run backfill:invoice-item-matches -- --user-id=<uuid>
```

**Requires:** `SUPABASE_SERVICE_ROLE_KEY` + `VITE_SUPABASE_URL` in `.env.local` (same as price-history backfill).

## Idempotency

- Upsert conflict target: `invoice_item_id` (PK)
- Re-run safe: same matcher inputs → same row payload
- Does **not** delete orphan rows; report `orphanMatchInvoiceItemIds` for manual cleanup

## Dry-run behavior

- Runs matcher + classification for every targeted `invoice_item`
- Reports `byStatus` projection and `coverage` (missing / orphan / duplicate)
- **No** Supabase writes

## When to run

| Scenario | Action |
|----------|--------|
| Phase 2 validation on VL | Dry-run on VL project; review diff vs virtual matcher |
| After enabling shadow flag in dev | Optional apply backfill for historical lines |
| Production | Manual admin only — **never** auto-run from app paths |

## Expected VL taxonomy (post-apply)

Per `IMPLEMENTATION_PHASES.md` Phase 2 criteria (51 VL lines):

| Bucket | Expected count | Notes |
|--------|---------------|-------|
| `unmatched` | 40 | Matcher null |
| `suggested` | 4 + Pepino-class + 11 extract-synced reclassifications | Includes line `8e9e727a` (Pepino) |
| `confirmed` | 7 | Alias-backed (`confirmed-alias`) |

## Remediation note

The 11 historically extract-synced lines will seed as `suggested` while legacy `ingredient_price_history` rows may still exist — history cleanup is **Phase 6**, not Phase 2.
