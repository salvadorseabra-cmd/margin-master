# Match Lifecycle Read Cutover — Operational Overlay Completion

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Pre-change commit:** `854f612` (`Snapshot pre-match-read-cutover baseline for operational overlay work.`)

## Summary

Wired `VITE_MATCH_LIFECYCLE_READ_CUTOVER` into all Operational Overlay read loaders. When the flag is enabled, `invoice_item_matches` drives ingredient_id assignment during overlay scans; the virtual matcher remains fallback when no persisted row exists or the flag is off.

Recipe Costing (`recipe-prep-cost.ts`, `resolveOperationalIngredientCostFields`, `ingredientLineCostEur`) was **not modified**. It continues receiving `Map<ingredientId, OperationalInvoiceCostEntry>` from `loadOperationalIngredientCostOverlay`.

## Architecture (unchanged boundary)

```
Invoice Item → Matching → ingredient_id → Operational Overlay → Recipe Costing
                              ↑
                    invoice_item_matches (when READ_CUTOVER ON)
                    virtual matcher (fallback / flag OFF)
```

## Changes

### New helper — `loadPersistedMatchByItemIdForScan`

**File:** `src/lib/ingredient-operational-intelligence.ts`

Shared loader used by all overlay scan paths. Mirrors `loadCatalogReviewInvoiceItemScan` pattern:

1. Return empty map when `!isMatchLifecycleReadCutoverEnabled()` or no scan rows
2. `getInvoiceItemMatchesForItemIds(client, scanRowIds)`
3. `buildPersistedMatchMapFromRows(matchRows)`

### Wired loaders

| Function | File | Change |
|----------|------|--------|
| `loadOperationalIngredientCostOverlay` | `ingredient-operational-intelligence.ts` | Loads persisted map → passes to `buildLatestOperationalIngredientCostByIngredientIdFromScan` |
| `loadIngredientMatchedInvoiceProducts` | `ingredient-operational-intelligence.ts` | Loads persisted map → passes to `buildMatchedInvoiceProductsFromScan` options |
| `loadLatestPurchaseGlanceByIngredientId` | `ingredient-pricing-freshness.ts` | Loads persisted map → passes to `buildLatestPurchaseGlanceByIngredientIdFromScan` |
| `loadLatestConfirmedPurchaseAtByIngredientId` | `ingredient-pricing-freshness.ts` | Same pattern via `buildLatestConfirmedPurchaseAtByIngredientIdFromScan` |

### Build functions (already supported param — callers now wired)

- `buildLatestOperationalIngredientCostByIngredientIdFromScan` — uses `buildCutoverContextForInvoiceItem` per row
- `buildLatestPurchaseGlanceByIngredientIdFromScan` — same
- `buildMatchedInvoiceProductsFromScan` — same
- `buildLatestConfirmedPurchaseAtByIngredientIdFromScan` — threads param through to glance builder

### Environment

**File:** `.env.example`

Documented `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` for VL. Enable in `.env.local` to activate cutover reads in dev/VL.

## Files modified

| File | Modified? |
|------|-----------|
| `src/lib/ingredient-operational-intelligence.ts` | **YES** |
| `src/lib/ingredient-pricing-freshness.ts` | **YES** |
| `.env.example` | **YES** (documentation) |
| `src/lib/recipe-prep-cost.ts` | **NO** |
| `src/lib/resolve-operational-ingredient-cost.ts` | **NO** |
| Matching algorithms / validation engine / procurement | **NO** |

## Return to parent

| Field | Value |
|-------|-------|
| Pre-change commit hash | `854f612` |
| Recipe Costing modified? | **NO** |
| Operational Overlay modified? | **YES** |
| READ_CUTOVER complete (overlay layer)? | **YES** |
| Virtual matcher fallback only? | **YES** — `resolveReadCutoverMatch` returns virtual when flag off, no persisted map, or `persistedMatch === null` |
| Remaining blockers | (1) Flag off by default — enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` in VL `.env.local`; (2) Prosciutto extract-gate orphan `ingredient_price_history`; (3) `syncOperationalIngredientCostsFromInvoiceLines` still virtual-only (write path, out of scope); (4) price_history confirm gate not implemented |
| Confidence | **90%** |

## Regression results

### Unit tests

```
npm test -- src/lib/invoice-item-match-read-cutover.test.ts src/lib/recipe-prep-cost.test.ts
→ 35/35 PASS
```

### Match lifecycle audit

```
npx vite-node .tmp/match-lifecycle-final-certification/audit.mts
→ exit 0
```

Key VL cases (cutover replay):

| Case | Score |
|------|-------|
| Gorgonzola | 🟢 |
| Guanciale | 🟢 |
| Aceto | 🟢 |
| Ginger Beer | 🟢 |
| Peroni | 🟢 |
| Ovo | 🟢 |
| Tomilho | 🟢 |
| Prosciutto | 🟡 (intentional status drift: persisted `suggested` vs virtual `confirmed`) |

Cutover↔persisted alignment: **100%**

### E2E recipe certification

```
npx vite-node .tmp/end-to-end-recipe-certification/audit.mts
→ exit 0 — 12/12 recipes PASS, 34/34 ingredient lines PASS
```

Gorgonzola regression (+10% price bump): PASS (delta €0.0398 exact)

### Validation findings

```
npx vite-node .tmp/validation-findings-acceptance-test/replay.mts
→ exit 0 — 40 findings, 0 false positives
```

## Notes

- The match-lifecycle audit report template still contains stale "overlay unwired" prose in Phase 1/6/7 — the **code** is wired; re-run audit template update separately if desired.
- Callers (`recipes.tsx`, `ingredients.tsx`, `ingredient-detail-operational-layout.tsx`) require no changes — cutover is internal to loaders.
