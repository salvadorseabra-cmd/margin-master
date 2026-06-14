# Coverage Report — invoice_item_matches vs invoice_items (VL)

**Generated:** 2026-06-14 · **Project:** bjhnlrgodcqoyzddbpbd · **Mode:** READ-ONLY

---

## Live DB State (Actual)

| Metric | Value | Source |
|--------|------:|--------|
| `invoice_items` total | **51** | Live query 2026-06-14 |
| `invoice_item_matches` total | **0** (table does not exist) | `to_regclass()` → null |
| Missing match records | **51** (100%) | All lines uncovered |
| Orphan match records | **0** | N/A — no table |
| Duplicate match records | **0** | PK not deployed |

**Flags (production default):**

- `VITE_MATCH_LIFECYCLE_SHADOW_SEED` → OFF
- `VITE_MATCH_LIFECYCLE_DUAL_WRITE` → OFF

**Runtime write coverage today: 0%.**

---

## Expected State After Migration + Backfill Dry-Run

| Metric | Expected |
|--------|----------|
| `invoice_items` | 51 |
| `invoice_item_matches` | 51 (1:1 PK on `invoice_item_id`) |
| Missing | 0 |
| Orphans | 0 (backfill does not delete orphans; report only) |
| Duplicates | 0 (PK prevents) |

**Projected `byStatus` (from `resolvePersistedMatchStatusFromMatcher` + VL taxonomy):**

| Status | Count | Notes |
|--------|------:|-------|
| `unmatched` | 40 | Matcher null |
| `suggested` | 5 | 4 semantic + 1 Pepino (`exact`) |
| `confirmed` | 6 | `confirmed-alias` only |

Source: `.tmp/remove-match-investigation/query-summary.json` (virtual) + `invoice-item-match-helpers.ts:107-114` (persisted rules).

---

## Coverage Gaps (Write Paths)

| Path | Writes matches? | Coverage impact |
|------|----------------|-----------------|
| Extract/re-extract (shadow seed) | Only if `SHADOW_SEED=ON` | 100% at extract when ON |
| Confirm / manual pick / correction | Only if `DUAL_WRITE=ON` | User actions only |
| Reject pair / Remove match | **No** | Persisted stale |
| Catalog review reassign | **No** | Persisted stale |
| Backfill script | Manual admin | Historical 51/51 |

---

## Blockers Before 100% Coverage

1. Apply migration `20260614120000_invoice_item_matches.sql` on VL
2. Run `npm run backfill:invoice-item-matches -- --dry-run` (requires `SUPABASE_SERVICE_ROLE_KEY`)
3. Enable shadow seed for re-extract resilience

See `coverage.json` for structured counts.
