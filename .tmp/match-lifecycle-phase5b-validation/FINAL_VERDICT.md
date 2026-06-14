# Phase 5B — Final Verdict

**Generated:** 2026-06-14

## Overall Verdict: **SUCCESS**

Reassign A→B now performs subtractive cleanup on ingredient A before forward writes to B, matching `(unmatch A) + (assign B)` for pricing reversal.

---

## Validation Questions 1–7

| # | Question | Verdict |
|---|----------|---------|
| 1 | What writes on A→B? | Documented in `REASSIGN_FLOW.md` — reject, A cleanup, alias/cost B, lifecycle, events |
| 2 | Old history deleted? | **FULLY_REVERSIBLE** |
| 3 | Old current_price recalculated? | **FULLY_REVERSIBLE** |
| 4 | Reconcile for A? | **FULLY_REVERSIBLE** |
| 5 | Reconcile for B? | **PARTIALLY_REVERSIBLE** — unchanged; first INSERT still skips reconcile (pre-existing) |
| 6 | History row on A remains? | **FULLY_REVERSIBLE** (for reassigned invoice) |
| 7 | Duplicate pricing influence? | **FULLY_REVERSIBLE** |

## Q10 Lifecycle Verdict (reassign A→B)

**FULLY_REVERSIBLE** for match + pricing dimensions addressed in Phase 5B.

Remaining partial: Q5 B reconcile on first INSERT (out of scope — not a reassign-reversal gap).

---

## Test Results

```
npm test -- --run \
  src/lib/match-lifecycle-reassign.test.ts \
  src/lib/match-lifecycle-reassign-pricing.test.ts \
  src/lib/match-lifecycle-unmatch.test.ts \
  src/lib/match-lifecycle-unmatch-pricing.test.ts \
  src/lib/match-lifecycle-service.test.ts \
  src/lib/invoice-item-match-read-cutover.test.ts

Test Files  6 passed (6)
Tests       27 passed (27)
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/match-lifecycle-unmatch-pricing.ts` | Extract `subtractivePricingCleanupForPreviousIngredient` |
| `src/lib/match-lifecycle-reassign-pricing.ts` | **new** reassign subtractive wrapper |
| `src/lib/match-lifecycle-flags.ts` | `VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE` |
| `src/routes/invoices.tsx` | Cleanup before persist in `selectIngredientForItem` |
| `src/lib/match-lifecycle-reassign-pricing.test.ts` | **new** |
| `src/lib/match-lifecycle-reassign.test.ts` | **new** Pepino + Mozzarella + regression |
| `src/lib/match-lifecycle-unmatch-pricing.test.ts` | Shared core test |

## Functions Changed

| Function | Module |
|----------|--------|
| `subtractivePricingCleanupForPreviousIngredient` | `match-lifecycle-unmatch-pricing.ts` (new shared) |
| `subtractivePricingCleanupForUnmatch` | refactored to delegate |
| `subtractivePricingCleanupForReassign` | `match-lifecycle-reassign-pricing.ts` (new) |
| `isMatchLifecycleReassignSubtractiveEnabled` | `match-lifecycle-flags.ts` (new) |
| `selectIngredientForItem` | `invoices.tsx` (A cleanup + A cost event) |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Cleanup fails but forward writes proceed | Logged; same pattern as unmatch — alias/cost still run |
| Flags misconfigured | Reassign flag OFF → explicit rollback to pre-5B |
| B first-INSERT reconcile gap | Pre-existing; not introduced by 5B |
| Live VL not replayed | Unit tests cover Pepino/Mozzarella mocks |

---

## Rollback

```
VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE=false
```

Or disable master subtractive:

```
VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING=false
```
