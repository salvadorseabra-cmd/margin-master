# Phase 3 — Match Lifecycle Service (Dual Write) Implementation Summary

**Date:** 2026-06-14 · **Scope:** Match Lifecycle V1 Phase 3 only

## Objective

Centralize lifecycle persistence in `match-lifecycle-service.ts` and **dual-write** `invoice_item_matches` on user confirm/correct/manual-assignment actions — after existing alias + cost flows succeed. No read cutover, no UI changes, no pricing/history logic in MLS.

## What shipped

| Area | Change |
|------|--------|
| Feature flag | `VITE_MATCH_LIFECYCLE_DUAL_WRITE` — default **OFF**; enable with `true` / `1` / `on` |
| MLS module | `src/lib/match-lifecycle-service.ts` — `confirmMatch`, `correctMatch`, `reassignMatch`, `markSuggested`, `markUnmatched` |
| Dual-write wiring | `invoices.tsx` — additive calls after successful alias/cost persist |
| Tests | `src/lib/match-lifecycle-service.test.ts` — 7 new tests (35 total across related suites) |

## What did NOT ship (Phase 4+)

- Read-path cutover from `invoice_item_matches`
- Remove Match UI / `markUnmatched` UI wiring
- MLS ownership of pricing, history, reconcile, or cost dispatch
- Changes to virtual matcher resolution order
- Pack Variants, data remediation, subtractive correction cleanup

## MLS functions

| Function | Transition | Notes |
|----------|------------|-------|
| `confirmMatch` | T3 Suggested → Confirmed | Idempotent when already confirmed to same ingredient |
| `correctMatch` | T6/T7 | `keepConfirmed` or inferred from existing record |
| `reassignMatch` | T7 alias | `correctMatch` with `keepConfirmed: true` |
| `markSuggested` | T6 / shadow alignment | Implemented; not wired to UI in Phase 3 |
| `markUnmatched` | T4/T5 | Write-only; Phase 5 UI |

All functions no-op when `VITE_MATCH_LIFECYCLE_DUAL_WRITE` is OFF.

## Files changed

- `src/lib/match-lifecycle-flags.ts` — `isMatchLifecycleDualWriteEnabled`
- `src/lib/match-lifecycle-service.ts` — **new** MLS write module
- `src/lib/match-lifecycle-service.test.ts` — **new** tests
- `src/routes/invoices.tsx` — dual-write helper + call sites

## Recommended next phase

**Phase 4 — Read-path cutover:** enable `VITE_MATCH_LIFECYCLE_READ_FROM_RECORD` (or equivalent); make `resolveInvoiceTableRowIngredientMatch` prefer persisted match records; demote virtual matcher to projection-only after seed + dual-write validation.
