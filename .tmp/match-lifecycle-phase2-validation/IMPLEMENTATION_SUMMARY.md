# Phase 2 — Shadow Seed Implementation Summary

**Date:** 2026-06-14 · **Scope:** Match Lifecycle V1 Phase 2 only

## Objective

Populate `invoice_item_matches` in **shadow mode** while preserving all existing runtime behavior (virtual matcher, review UI, cost sync, OI).

## What shipped

| Area | Change |
|------|--------|
| Feature flag | `VITE_MATCH_LIFECYCLE_SHADOW_SEED` — default **OFF**; enable with `true` / `1` / `on` |
| Classification | `resolvePersistedMatchStatusFromMatcher` — conservative seed policy: only `confirmed-alias` / `confirmed-override` → `confirmed`; all other matcher hits → `suggested`; null → `unmatched` |
| Shadow service | `src/lib/invoice-item-match-shadow-seed.ts` — build record, batch upsert, coverage report, backfill |
| Extract hook | `invoices.tsx` post-insert calls `shadowSeedInvoiceItemMatchesAfterExtract` (flag-gated, errors logged only) |
| Admin backfill | `scripts/backfill-invoice-item-matches.mts` + npm script `backfill:invoice-item-matches` |
| Tests | Helpers, shadow seed, repository (28 tests) |

## What did NOT ship (Phase 3+)

- Read-path cutover from `invoice_item_matches`
- MLS write path / confirm-correct-unmatch delegation
- Remove Match UI, Pack Variants, data remediation
- Auto-run backfill in production paths
- Changes to review behavior in `invoices.tsx`

## Safe creation points

1. **Extract path** (`invoices.tsx` ~1385): after `invoice_items` insert + cost sync; loads persisted row IDs, runs matcher per line with **full-invoice match catalog**, upserts shadow records when flag enabled.
2. **Admin backfill** (`scripts/backfill-invoice-item-matches.mts`): idempotent upsert for historical lines; never auto-invoked.

The OI sync loop (`syncOperationalIngredientCostsFromInvoiceLines`) was **not** wired — it lacks stable `invoice_item_id` inputs and would duplicate extract seeding.

## Validation question answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Application behavior unchanged? | **Yes** — flag default OFF; no read paths consume the table; matcher + UI unchanged |
| 2 | Can `invoice_item_matches` be deleted and recreated? | **Yes** — shadow rows are derived projections; delete + backfill reproduces them |
| 3 | Shadow population idempotent? | **Yes** — upsert on `invoice_item_id` PK; re-run produces identical payloads (fixed `now` in tests) |
| 4 | All `invoice_items` representable? | **Yes** — every line maps to `unmatched` / `suggested` / `confirmed` via `mapMatcherOutputToInitialMatchRecord` |
| 5 | Validation Lab still operational? | **Yes** — zero read-path dependency; VL harnesses unchanged when flag OFF |

## Files changed

- `src/lib/match-lifecycle-flags.ts` — add `isMatchLifecycleShadowSeedEnabled`
- `src/lib/invoice-item-match-helpers.ts` — `resolvePersistedMatchStatusFromMatcher`; update `mapMatcherOutputToInitialMatchRecord`
- `src/lib/invoice-item-match-helpers.test.ts` — conservative classification tests
- `src/lib/invoice-item-match-shadow-seed.ts` — **new** shadow seed service
- `src/lib/invoice-item-match-shadow-seed.test.ts` — **new** tests
- `src/routes/invoices.tsx` — extract hook (shadow write only)
- `scripts/backfill-invoice-item-matches.mts` — **new** admin script
- `package.json` — `backfill:invoice-item-matches` script

## Recommended next phase

**Phase 3 — Match Lifecycle Service (write path):** centralize confirm/correct/unmatch transitions; dual-write match records on user actions while reads remain virtual until Phase 4 sign-off.
