# Pipeline Trace — Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Related audits:** `.tmp/anchoas-reread-investigation/INVOICE_TRACE.md`, `.tmp/match-lifecycle-phase4a-validation/`

---

## Problem Statement

Repeated re-reads of the same invoice produce different match results (Anchovas/Pepino flip pattern). This trace documents the full execution order from UI trigger through OCR, item recreation, matcher, shadow seed, dual write, read cutover, and UI load.

---

## Entry Point: `reExtract(row)`

**File:** `src/routes/invoices.tsx` (~2393)

```
reExtract(row)
  → signed URL fetch → blob → dataUrl
  → runExtraction(invoiceId, dataUrl)          [mutex: extractionInFlightRef]
  → update invoices header (supplier, date, total)
  → loadItems(invoiceId)                       [reload UI rows]
  → load()                                     [reload invoice list]
```

The re-read button calls `reExtract` with the existing invoice row. No separate code path — re-read uses the same extraction pipeline as initial ingest.

---

## Inside `runExtraction` (~1344–1583)

Strict **sequential** order:

| Step | Action | Code ref |
|------|--------|----------|
| 1 | `extract-invoice` edge function (OCR) | ~1373 |
| 2 | Normalize + filter rows | ~1399–1401 |
| 3 | **`DELETE invoice_items WHERE invoice_id`** | ~1435–1438 |
| 3a | → **CASCADE deletes `invoice_item_matches`** | FK constraint |
| 4 | **`INSERT` new rows (new UUIDs each time)** | ~1451–1466 |
| 5 | Cost sync (`syncOperationalIngredientCostsFromInvoiceLines`) | ~1486–1506 |
| 6 | Re-load persisted item IDs | ~1514–1517 |
| 7 | **`await shadowSeedInvoiceItemMatchesAfterExtract`** (if `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`) | ~1524–1531 |
| 8 | Return metadata | ~1565 |

**Critical:** Step 3 wipes all prior items and their match rows. Step 4 always creates fresh UUIDs. Matching on re-read is therefore a function of **new OCR output × current DB snapshot** (aliases, overrides, catalog), not prior item/match state.

---

## Shadow Seed

**File:** `src/lib/invoice-item-match-shadow-seed.ts` (~201–245)

After insert, shadow seed:

1. Loads canonical ingredient catalog + alias map
2. Runs virtual matcher per new item (`useReadCutover: false`)
3. Maps matcher output to persisted status via `resolvePersistedMatchStatusFromMatcher`
4. Upserts one `invoice_item_matches` row per item

**Persisted status mapping** (`src/lib/invoice-item-match-helpers.ts`):

- `confirmed-alias` / `confirmed-override` → `confirmed`
- Bare `exact` (ingredient found) → `suggested`
- No match → `unmatched`

Shadow seed is **awaited** on the extract path — it completes before `runExtraction` returns.

---

## Dual Write

**File:** dual write helpers invoked from user actions in `invoices.tsx`

`dualWriteMatchLifecycleAfterIngredientPersist` is **`void` fire-and-forget** on user confirm/correct/reassign only.

**Not invoked on extract/re-read path.** Dual write cannot cause re-read flip.

---

## Read Cutover

**File:** `src/lib/invoice-item-match-read-cutover.ts`  
**Load site:** `loadItems` (~1789–1800)

When `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true`:

- Loads `invoice_item_matches` into `persistedMatchByItemId`
- Row rendering uses `resolveInvoiceTableRowIngredientMatch` → `resolveReadCutoverMatch`

When **`READ_CUTOVER=false`** (current VL flags):

- Persisted match map is **not** loaded for display
- UI uses virtual matcher output only
- Creates intentional drift: Pepino shows `confirmed` (virtual `exact`) while persisted row is `suggested`

**Current VL flags** (from `.tmp/pepino-live-validation/baseline.json`):

| Flag | Value |
|------|-------|
| `VITE_MATCH_LIFECYCLE_SHADOW_SEED` | `true` |
| `VITE_MATCH_LIFECYCLE_DUAL_WRITE` | `true` |
| `VITE_MATCH_LIFECYCLE_READ_CUTOVER` | **`false`** |

---

## UI Row Display

**File:** `src/lib/invoice-ingredient-row-display.ts`

`resolveInvoiceTableRowIngredientMatch` chooses virtual vs persisted based on read cutover flag.

Virtual layer treats bare `exact` as confirmed (`src/lib/ingredient-match-explanation.ts`):

```typescript
export function isConfirmedIngredientMatch(match): boolean {
  return (
    match?.kind === "exact" ||
    match?.kind === "confirmed-override" ||
    match?.kind === "confirmed-alias" ||
    // ...
  );
}
```

This is why Pepino appears matched in UI even when persisted status is `suggested` or `unmatched`.

---

## Mutex / Concurrency

`extractionInFlightRef` prevents double extract on the same invoice. Re-read while extraction is in-flight is blocked.

---

## Pipeline Diagram

```
┌─────────────┐
│  reExtract  │
└──────┬──────┘
       ▼
┌─────────────────┐
│ extract-invoice │  ← OCR (non-deterministic)
│  (edge fn)      │
└──────┬──────────┘
       ▼
┌─────────────────┐
│ DELETE items    │  ← CASCADE deletes matches
└──────┬──────────┘
       ▼
┌─────────────────┐
│ INSERT items    │  ← new UUIDs every time
└──────┬──────────┘
       ▼
┌─────────────────┐
│  cost sync      │
└──────┬──────────┘
       ▼
┌─────────────────┐
│  shadow seed    │  ← virtual matcher → persisted upsert
└──────┬──────────┘
       ▼
┌─────────────────┐
│  loadItems      │  ← virtual display (READ_CUTOVER OFF)
└─────────────────┘
```

---

## Conclusion

The re-read pipeline is **sequential and deterministic given fixed OCR text + DB snapshot**. Non-determinism enters at:

1. **OCR** (step 1) — different text each re-read
2. **CASCADE reset** (step 3) — no carry-forward of prior confirmations
3. **Display layer** (loadItems) — virtual vs persisted split when READ_CUTOVER is OFF

See `FINAL_VERDICT.md` for classification.
