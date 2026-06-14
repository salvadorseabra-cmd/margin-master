# Re-Read Validation — Bidfood Invoice Resilience

**Generated:** 2026-06-14 · **Invoice:** `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`

---

## Method

**Simulated re-extract** via service-role script (equivalent to app delete+insert+shadow seed):

```bash
./node_modules/.bin/vite-node .tmp/match-lifecycle-activation-validation/run-validation.mts reread
```

UI/browser re-read was **not performed** — simulation mirrors `invoices.tsx` persistence flow:

1. `DELETE FROM invoice_items WHERE invoice_id = ?` (CASCADE match rows)
2. `INSERT` same 11 line payloads (new UUIDs)
3. `shadowSeedInvoiceItemMatchesAfterExtract()` with `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`

This is acceptable per activation brief when UI re-read is not feasible.

---

## CASCADE Delete Verification

| Metric | Value |
|--------|------:|
| Bidfood lines before delete | 11 |
| Match rows tied to old item UUIDs (before) | 11 |
| Orphan match rows after delete | **0** |

**Result:** FK `ON DELETE CASCADE` on `invoice_item_id` works as designed.

Old Pepino UUID `514feb41-6cd4-44f1-abc8-344f0c0dfc23` — match row removed.

---

## Shadow Seed After Re-Insert

| Metric | Value |
|--------|------:|
| Items inserted | 11 |
| Shadow seed upserted | 11 |
| Shadow seed errors | 0 |
| Bidfood `byStatus` after seed | unmatched: 10, suggested: 1, confirmed: 0 |

Log excerpt:

```
[invoice_item_matches shadow-seed] {
  action: 'extract_seed_complete',
  invoiceId: 'da472b7f-0fd9-4a26-a37c-80ad335f7f7e',
  upserted: 11,
  byStatus: { unmatched: 10, suggested: 1, confirmed: 0 }
}
```

Pepino re-seeded on new UUID `c715f6ad-e685-4e7b-ae9c-e369848f08a5` as `suggested` / `exact`.

---

## VL-Wide Coverage After Re-Read

| Metric | Value |
|--------|------:|
| Total `invoice_items` | 51 |
| Total `invoice_item_matches` | 51 |
| Missing | 0 |
| Orphans | 0 |
| Duplicates | 0 |

**VL-wide `byStatus` unchanged:** unmatched 40, suggested 5, confirmed 6.

Non-Bidfood invoices (Aviludo confirmed rows) unaffected.

---

## Confirmed-Preserve Policy (T8)

**Not implemented.** Re-read does not preserve prior user `confirmed` transitions in persisted layer. Pepino correctly re-seeds as `suggested` — documented risk for Phase 4, not activation blocker.

---

## UI Re-Read Blocker Note

Live OCR re-read through the app was not executed in this session (no dev server / authenticated browser session). DB-level simulation validates:

- CASCADE delete behavior
- Shadow seed with flags ON
- 100% coverage restoration

For full end-to-end sign-off, run Bidfood re-extract in VL UI with `.env.local` flags and confirm console log `extract_seed_complete`.

---

## Outcome

| Check | Result |
|-------|--------|
| Old match rows CASCADE-deleted | **PASS** |
| Shadow seed creates new rows | **PASS (11/11)** |
| VL coverage remains 100% | **PASS (51/51)** |
| Pepino re-seeds suggested/exact | **PASS** |

**Re-read verdict:** PASS (simulated)
