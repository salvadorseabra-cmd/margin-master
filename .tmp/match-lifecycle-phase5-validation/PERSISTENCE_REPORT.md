# Phase 5 — Persistence Report

**Generated:** 2026-06-14

## `invoice_item_matches` (SoT when READ_CUTOVER ON)

### `markUnmatched` fields

| Field | Value on unmatch |
|-------|------------------|
| `status` | `unmatched` |
| `ingredient_id` | `NULL` |
| `previous_ingredient_id` | prior suggestion/confirmed ingredient |
| `match_kind` | `NULL` |
| `confirmed_at` | `NULL` |
| `corrected_at` | set when `previous_ingredient_id` present |

### Write gating

- **Unmatch:** always writes (no `VITE_MATCH_LIFECYCLE_DUAL_WRITE` gate)
- Confirm/correct/reassign: still gated by dual-write flag

### Idempotency

Second unmatch on same line returns existing `unmatched` row without extra writes (`match-lifecycle-service.test.ts`).

## Correction Memory

`rejectIngredientMatchPair` called when `previousIngredientId` is set:

- Persists `(wording, rejected_ingredient_id)` to local reject log
- Blocks immediate re-suggestion of rejected ingredient
- Does **not** delete `ingredient_aliases` (per T4/T5 design)

## In-Memory Cutover Cache

`invoices.tsx` updates `persistedMatchByItemId` immediately after successful unmatch so UI reflects tombstone without full reload.

## Tests

| Test file | Coverage |
|-----------|----------|
| `match-lifecycle-service.test.ts` | `markUnmatched` field clearing; writes when dual-write OFF |
| `match-lifecycle-unmatch.test.ts` | Pepino tombstone + history delete + reject pair |
