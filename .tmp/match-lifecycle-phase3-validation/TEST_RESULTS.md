# Phase 3 — Test Results

**Run date:** 2026-06-14  
**Command:** `npm test -- src/lib/match-lifecycle-service.test.ts src/lib/invoice-item-match-helpers.test.ts src/lib/invoice-item-match-shadow-seed.test.ts src/lib/invoice-item-match-repository.test.ts`

## Summary

| Suite | Tests | Result |
|-------|------:|--------|
| `match-lifecycle-service.test.ts` | 7 | ✅ Pass |
| `invoice-item-match-helpers.test.ts` | 15 | ✅ Pass |
| `invoice-item-match-shadow-seed.test.ts` | 7 | ✅ Pass |
| `invoice-item-match-repository.test.ts` | 6 | ✅ Pass |
| **Total** | **35** | **✅ All pass** |

Duration: ~4.1s

## New MLS test coverage

| Test | Requirement covered |
|------|---------------------|
| `confirmMatch transitions suggested to confirmed` | Suggested → Confirmed |
| `confirmMatch is idempotent when already confirmed to same ingredient` | Idempotent confirm |
| `reassignMatch keeps confirmed status with new ingredient` | Confirmed → Reassigned |
| `correctMatch on suggested line stays suggested with manual kind` | Manual correction (suggested) |
| `correctMatch upserts manual confirmed assignment when no prior record` | Manual assignment without seed row |
| `does not write when dual-write flag is disabled` | Flag OFF = no writes |
| `markUnmatched clears assignment when flag enabled` | `markUnmatched` write path (no UI) |

## Not covered in automated tests (manual / Phase 4)

- End-to-end Supabase integration against live DB
- `invoices.tsx` handler integration (no component tests added — additive wiring only)
- Read-path behavior (unchanged by design)
