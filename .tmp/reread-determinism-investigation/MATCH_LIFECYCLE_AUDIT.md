# Match Lifecycle Audit — Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Related audits:** `.tmp/anchoas-reread-investigation/LIFECYCLE_AUDIT.md`, `.tmp/match-lifecycle-activation-validation/REREAD_VALIDATION.md`, `.tmp/match-lifecycle-phase4b-validation/READ_CUTOVER_REPORT.md`

---

## Questions

| Question | Answer |
|----------|--------|
| Do `invoice_item_matches` survive re-read? | **NO** — FK `ON DELETE CASCADE` when items deleted |
| Recreated? | **YES** — shadow seed upserts 1 row per new item UUID |
| Replaced in-place? | **NO** — always new PK (`invoice_item_id`) |
| T8 preserve policy? | **Not implemented** — prior user `confirmed` not carried forward |
| Shadow seed deterministic? | **YES** given same OCR + alias map + catalog |

---

## Lifecycle on Re-Read

```
DELETE invoice_items (invoice_id = X)
  └─ CASCADE DELETE invoice_item_matches (invoice_item_id IN deleted items)

INSERT invoice_items (new UUIDs)
  └─ shadow seed: upsert invoice_item_matches per new item
```

Every re-read is a **full lifecycle reset**. Prior match rows are destroyed; new rows are seeded from scratch via virtual matcher output.

---

## Shadow Seed Behavior

**Trigger:** `await shadowSeedInvoiceItemMatchesAfterExtract` in `runExtraction` when `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`.

**Per item:**

1. Run `findInvoiceItemIngredientMatch` (virtual matcher, `useReadCutover: false`)
2. Map result via `resolvePersistedMatchStatusFromMatcher`:
   - `confirmed-alias` / `confirmed-override` → `confirmed`
   - Bare `exact` with ingredient → `suggested`
   - No match → `unmatched`
3. Upsert `invoice_item_matches` row

Shadow seed is **awaited** — completes before extraction returns. No orphan rows from incomplete seed on extract path.

---

## Coverage (Live VL)

From `.tmp/pepino-live-validation/baseline.json`:

| Metric | Value |
|--------|-------|
| `invoice_items` | 51 |
| `invoice_item_matches` | 51 |
| Orphans | 0 |
| Duplicates | 0 |

Lifecycle table is fully covered. Non-determinism is not from orphan/stale match rows.

---

## What Is NOT Preserved on Re-Read

| State | Preserved? | Notes |
|-------|------------|-------|
| User `confirmed` on prior item UUID | ❌ | Item deleted → match CASCADE deleted |
| User `unmatched` / tombstone | ❌ | New item gets fresh seed |
| `corrected_at` timestamp | ❌ | New row, new timestamps |
| Reject pairs (localStorage) | ⚠️ Partial | Hydrated by line text + supplier, not item UUID |
| Ingredient aliases (DB) | ✅ | Evolve independently; affect next seed |
| Confirmed overrides (DB) | ✅ | Restored for sibling lines on re-read |

**T8 preserve policy** (carry forward prior user confirmations across re-read) is **not implemented**. This is by design per current architecture, not a bug.

---

## Pepino Lifecycle Example

From `.tmp/pepino-live-validation/`:

| Event | Persisted status | Notes |
|-------|------------------|-------|
| Re-read #1 shadow seed | `suggested` / `exact` | Virtual shows `confirmed` |
| User unmatch (14:17) | `unmatched` | `corrected_at` set, `previous_ingredient_id` retained |
| Re-read #2 shadow seed | `unmatched` or re-seeded | Depends on reject pair hydration |
| User confirm → Pepino fresco | `confirmed` | Reassignment to different ingredient |

User actions between re-reads mutate persisted state; next re-read resets item UUID but DB-side aliases/overrides/reject pairs affect outcome.

---

## Anchovas Lifecycle Example

From `.tmp/anchoas-reread-investigation/`:

| Re-read | Persisted after seed | Reason |
|---------|---------------------|--------|
| #1 (`Alconfirsta`) | `unmatched` | No alias hit |
| #2 (`Alconfi sta`) | `unmatched` | No alias hit |
| #3 (`Alconfrisa`) | `confirmed` | Alias hit + override restoration |

Manual confirm between #2 and #3 added alias for `Alconfi sta` spelling. Re-read #3 OCR landed on `Alconfrisa` which already had alias coverage.

---

## Dual Write (User Actions Only)

`dualWriteMatchLifecycleAfterIngredientPersist` runs **`void`** (fire-and-forget) on confirm/correct/reassign.

- Not on extract path
- Can cause brief UI/DB drift during user action
- Does not explain re-read flip pattern

See `.tmp/match-lifecycle-phase3-validation/DUAL_WRITE_FLOW.md`.

---

## Read Cutover Impact

With `READ_CUTOVER=false`:

- UI does not load persisted match map for display
- Virtual matcher re-runs on each `loadItems`
- Persisted rows exist but are invisible to UI layer

With `READ_CUTOVER=true`:

- UI reads persisted status directly
- Pepino would show `suggested` not `confirmed` (aligned with persisted layer)

---

## Conclusion

Lifecycle behaves **as designed**:

- CASCADE wipe on re-read is intentional
- Shadow seed is deterministic per OCR + DB snapshot
- No orphan/stale rows
- No T8 preserve policy

Non-determinism comes from **upstream OCR** and **downstream display layer**, not from lifecycle table corruption or orphan match rows.
