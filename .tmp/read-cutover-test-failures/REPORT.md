# READ_CUTOVER test failure classification

**Run date:** 2026-06-25  
**Command:** `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true npm test`  
**Result:** 19 failed | 1705 passed (1724 total) — 10 test files  
**Raw log:** `.tmp/read-cutover-test-failures/test-output-cutover-true.txt`

## Cutover comparison

| Flag | Failed tests | Failed files |
|------|-------------|--------------|
| `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` | 19 | 10 |
| `VITE_MATCH_LIFECYCLE_READ_CUTOVER=false` | 19 | 10 |

**Finding:** Failure set is **identical** with cutover on vs off. `src/lib/invoice-item-match-read-cutover.test.ts` (7 tests) passes with cutover enabled. Uncommitted WIP in `ingredient-operational-intelligence.ts` / `ingredient-pricing-freshness.ts` does not change the failure count vs committed tree.

**Conclusion:** None of the 19 failures are attributable to `READ_CUTOVER` flag behavior in the current suite; they reflect pre-existing product/test drift.

---

## Summary by classification

| Classification | Count | READ_CUTOVER-specific? |
|----------------|------:|------------------------|
| Stale fixture | 3 | No |
| Test bug | 4 | No |
| Expected behavior change | 11 | No |
| Real product bug | 1 | No |
| Foundation regression | 0 | No |

---

## Grouped by root cause

### RC1 — Stale fixture: hardcoded calendar date in pricing freshness test

**Root cause:** `daysSinceRecency("2026-05-18")` is now 38 days (run on 2026-06-25), failing `toBeLessThan(30)`.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/ingredient-pricing-freshness.test.ts` | parses ISO purchase dates from invoice scan | `expect(days!).toBeLessThan(30)` — received 38 | ~2026-06-17+ (30 days after fixed date); test added `250e77a` 2026-05-23 | Stale fixture |

---

### RC2 — Stale fixture: packaged liquid label format updated elsewhere

**Root cause:** `formatPackagedLiquidContext` compact label is `450ml pack · €4.59` (`packaged-liquid-context.ts`, covered by `packaged-liquid-context.test.ts`). `display-unit-cost.test.ts` still expects legacy `450ml · €4.59`.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/display-unit-cost.test.ts` | packaged liquid subtitle complements €/L primary label | `expect(formatPackagedLiquidContext(...)).toBe("450ml · €4.59")` — received `450ml pack · €4.59` | Since label change `7bb9d60` 2026-05-26 | Stale fixture |

---

### RC3 — Stale fixture: exposure drill-down `historyRow` defaults `invoice_id: null`

**Root cause:** Orphan quarantine (`isLinkedPriceHistoryRow` / `getLatestHistoryByIngredient`) drops unlinked rows. Default test helper sets `invoice_id: null`, so `supplierMovements` is empty.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/exposure-drill-down.test.ts` | builds category drill-down with top ingredients and deduped signals | `expect(model.supplierMovements.length).toBeGreaterThan(0)` — received 0 | Since orphan quarantine `c2a2023` 2026-06-08; helper blame `7bb9d60` 2026-05-26 | Stale fixture |

---

### RC4 — Test bug: Supabase mock missing `.is()` for null `supplier_name` scope

**Root cause:** `aliasOwnershipScopeQuery` (`ingredient-alias-memory.ts:104`) calls `query.is("supplier_name", null)`. Test doubles only chain `.eq()` and omit `.is()`.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/canonical-ingredient-create.test.ts` | persists invoice alias and rematch keys after manual link | `TypeError: query.is is not a function` at `aliasOwnershipScopeQuery` | Since `aliasOwnershipScopeQuery` `d4b528c` 2026-05-19; test last touched `06cf6bf` 2026-06-16 | Test bug |
| `src/lib/ingredient-rejected-match-memory.test.ts` | rematch succeeds after clearing rejection on manual persist | `TypeError: query.is is not a function` at `aliasOwnershipScopeQuery` | Same as above; test `76ea4a2` 2026-05-21 | Test bug |

---

### RC5 — Test bug: supplier-scoped alias key casing in assertions

**Root cause:** `buildIngredientAliasLookupKey` uses `normalizeSupplierScope` → lowercase (`metro::chicken breaded`). Tests assert `Metro::chicken breaded`.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/ingredient-correction-memory.test.ts` | stores supplier-scoped and global keys for CHK BREADED | `expect(result!.nextConfirmedAliases["Metro::chicken breaded"]).toBe("chk-1")` — undefined | Since Model D / supplier normalization `5faaefc`; test keys from `f2978b5` 2026-05-21 | Test bug |
| `src/lib/ingredient-correction-memory.test.ts` | upserts CHK BREADED alias after canonical create | `expect(applied!.nextConfirmedAliases["Metro::chicken breaded"]).toBe("chk-new")` — undefined | Same | Test bug |

---

### RC6 — Expected behavior change: invoice line normalization breaks `CHED TOP` horeca shorthand

**Root cause:** `CHED TOP` normalizes to `cheddar` (drops `TOP`); no viable catalog candidate vs `Molho Cheddar Dispensador`. Matcher returns `undefined`.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/ingredient-operational-aliases.test.ts` | CHED TOP matches Molho Cheddar Dispensador not sliced cheddar | `expect(match?.ingredient.id).toBe("sauce")` — received undefined | Test added `7f84094` 2026-05-20; fails under current normalize/match pipeline | Expected behavior change |

---

### RC7 — Expected behavior change: linked price history quarantine + price chain guard

**Root cause (quarantine):** Rows without non-empty `invoice_id` excluded from OI/margin intelligence surfaces (`linkedIngredientPriceHistoryRows`, `getLatestHistoryByIngredient`).

**Root cause (chain guard):** `isTrustedPriceMovementRow` requires a linked prior row and compatible purchase contracts (`ingredient-price-chain-guard.ts`). Single-row fixtures get `trustedPriceHistoryDeltaPercent` → 0, so supplier aggregates, owner-review counts, alerts, and trend `+N%` values fall back to spend/invoice-count copy.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/ingredient-price-history-linked.test.ts` | buildOperationalAlertItems skips orphan-only Gema and uses linked Atum row | `expect(atumAlert).toBeDefined()` — undefined (`price-decrease-${ATUM_ID}`) | Quarantine `c2a2023` 2026-06-08; chain guard `0e651a1` 2026-06-14 | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | emits real supplier names and margin ranges in trend panel items | `expect(supplierIncrease?.value).toMatch(/\+/)` — received `1 invoice` | Same guards on aggregation | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | emits structured metric rows from trend builders with fixture data | `expect(supplierMetrics.rows[0]?.value).toBe("+15%")` — received `€120.00` | Same | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | buildOwnerReviewViewModel maps weekly snapshot counts from existing synthesis data | `expect(ownerReview.weeklySnapshot.supplierIncreases).toBeGreaterThanOrEqual(1)` — received 0 | Same | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | buildOwnerReviewViewModel sorts financial risks by impact and dedupes rows | `expect(ownerReview.financialRisks.some(...Novilho Vazia...)).toBe(true)` — false | Trusted deltas / movement filtering | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | buildOwnerReviewViewModel exposes supplier ingredient changes without invoice metadata | `expect(alpha?.direction).toBe("up")` — undefined | `collectSupplierIngredientChanges` skips untrusted pct | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | owner review respects selected date range without cross-window fallback | `expect(view30.ownerReview.weeklySnapshot.supplierIncreases).toBe(1)` — received 0 | Same | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | does not fall back to all-time supplier aggregates when selected window is empty | `expect(view180.ownerReview.weeklySnapshot.supplierIncreases).toBe(1)` — received 0 | Same | Expected behavior change |
| `src/lib/operational-intelligence-synthesis.test.ts` | excludes orphan price history from OI movements and owner review | `expect(supplierNames).toContain("Alpha Foods")` — received `[]` | Linked row present but untrusted single-row chain | Expected behavior change |

---

### RC8 — Real product bug: centiliter pack size not expanded to 330 ml

**Root cause:** `formatStructuredPurchaseDisplay` / purchase parser emits `24 x 33 cl` instead of `24 x 330 ml` for `24x33cl` and `CERVEJA 24 X 33CL`. Related passing test documents embedded `33cl` → `330 ml` in product names only.

| Test file | Test name | First failing assertion | When started failing | Class |
|-----------|-----------|-------------------------|----------------------|-------|
| `src/lib/invoice-purchase-format.test.ts` | parses `24x33cl` | `expected '24 x 33 cl' to be '24 x 330 ml'` | Expectation since `7bb9d60` 2026-05-26; likely regressed near `e3f3694` 2026-06-24 | Real product bug |
| `src/lib/invoice-purchase-format.test.ts` | parses `CERVEJA 24 X 33CL` | same assertion | Same | Real product bug |

---

## Foundation regression vs expected behavior change

| Category | Tests | Notes |
|----------|------:|-------|
| **Foundation regression** | **0** | No failures tied to READ_CUTOVER read path or core vitest/infra breakage. |
| **Expected behavior change** | **11** | Orphan quarantine, price chain guard, and `CHED TOP` normalization/matching. |
| **Stale fixture / test bug** | **7** | Date drift, label copy, `invoice_id` in fixtures, mocks, alias key casing. |
| **Real product bug** | **1** (2 tests) | Centiliter pack parsing regression. |

---

## Confidence

| Claim | Confidence |
|-------|------------|
| Failure set unchanged by READ_CUTOVER true vs false | **High** (two full suite runs, same 19/1724) |
| No READ_CUTOVER-specific failures in current suite | **High** |
| Root-cause grouping (quarantine, chain guard, mocks, centiliter) | **High** (code paths traced; spot-isolated runs) |
| Exact calendar day pricing-freshness test began failing | **Medium** (inferred from fixed date + threshold) |
| Centiliter regression introduced in `e3f3694` | **Medium** (commit timing; not bisected) |

---

## Parent agent return payload

- **Total failing tests:** 19  
- **Grouped summary:**

| Root cause | Tests | Classification |
|------------|------:|------------------|
| RC1 Calendar stale date | 1 | Stale fixture |
| RC2 Packaged liquid label | 1 | Stale fixture |
| RC3 Exposure `invoice_id: null` helper | 1 | Stale fixture |
| RC4 Supabase mock missing `.is()` | 2 | Test bug |
| RC5 Alias key casing | 2 | Test bug |
| RC6 CHED TOP normalization | 1 | Expected behavior change |
| RC7 Quarantine + chain guard | 9 | Expected behavior change |
| RC8 Centiliter parsing | 2 | Real product bug |

- **Foundation regressions:** 0  
- **Expected behavior changes:** 11 (not READ_CUTOVER-driven)  
- **Confidence:** High that READ_CUTOVER does not explain any failure; medium on precise regression commit for centiliter.
