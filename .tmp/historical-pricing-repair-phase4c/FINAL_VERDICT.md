# Final Verdict — Historical Pricing Repair Phase 4C

**Date:** 2026-06-15  
**Checkpoint commit:** `602c768`  
**VL project:** `bjhnlrgodcqoyzddbpbd`

---

## Verdict: **SUCCESS**

---

## Summary

| Item | Status |
|---|---|
| Root cause fixed (`resolveCountablePurchaseQuantityForCost`) | ✅ |
| 6 history rows repaired via pipeline recompute | ✅ |
| Chain reconciliation × 3 ingredients | ✅ |
| Anchoas/Gema catalog refreshed | ✅ |
| Atum catalog (already correct) | ✅ untouched |
| Unit tests | ✅ 44/44 |
| Validation scripts | ✅ pass |

## Key metrics

| Metric | Before | After |
|---|---|---|
| Atum Apr `new_price` | 3.145 | **6.29** |
| Atum May Δ% | +316.5% | **+108.3%** |
| Anchoas catalog op | 4.995 | **9.99** |
| Gema catalog op | 1.748 | **10.49** |
| Multi-`un` `suspect_double_divide` | 5/5 | **0/5** |

## Rollback

If needed: restore from `scripts/backups/multi-un-phase4c-pre-update-2026-06-14T23-44-45.json` and revert code commit after checkpoint.

## Files changed (implementation)

- `src/lib/invoice-purchase-price-semantics.ts` — per-item detection
- `src/lib/invoice-purchase-price-semantics.test.ts` — 4 new tests
- `src/lib/ingredient-auto-persist.ts` — pass `total` as `line_total`
- `scripts/repair-multi-un-history.mts` — new repair script
