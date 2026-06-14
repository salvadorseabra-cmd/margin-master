# Re-Read Audit — Bidfood Invoice Re-Extract Resilience

**Generated:** 2026-06-14

---

## Observed Re-Reads (Bidfood `da472b7f`)

| Event | Pepino `invoice_item_id` | Timestamp |
|-------|--------------------------|-----------|
| Prior audit | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` | 2026-06-13T21:50:38Z |
| Re-read #1 | `dd539785-6267-437e-b2e1-34e2debc532e` | 2026-06-14T10:39:05Z |
| Re-read #2 (LIVE) | `514feb41-6cd4-44f1-abc8-344f0c0dfc23` | 2026-06-14T10:53:51Z |

Bidfood line count remains **11** after re-read.

---

## FK Cascade Behavior (Migration Design)

From `20260614120000_invoice_item_matches.sql`:

- `invoice_item_id` PK → `invoice_items(id) ON DELETE CASCADE`
- `invoice_id` → `invoices(id) ON DELETE CASCADE`

**On re-extract:** app deletes all `invoice_items` for invoice → **all match rows for old item UUIDs would CASCADE-delete**.

---

## Shadow Seed Behavior (Flag ON)

`shadowSeedInvoiceItemMatchesAfterExtract` (`invoice-item-match-shadow-seed.ts:199-244`):

1. Runs after insert when `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`
2. Upserts 1 row per new `invoice_item_id` via `upsertInvoiceItemMatch`
3. Errors logged, extract not rolled back

---

## Actual State Today

| Question | Answer |
|----------|--------|
| Old match rows disappear on re-read? | **N/A** — table absent, 0 rows |
| New rows appear? | **No** — flags OFF, no shadow seed |
| Coverage 100% after re-read? | **No** — 0/51 persisted |

---

## Expected Post-Migration + Flag ON

| Step | Outcome |
|------|---------|
| Re-extract deletes old items | Old match rows CASCADE-deleted |
| Shadow seed runs | 11 new rows for Bidfood (51 total VL) |
| Coverage | **100%** for current `invoice_items` set |
| Orphan old UUIDs | 0 (CASCADE) — unless backfill orphans pre-migration |

---

## Gap: Confirmed-Preserve Policy (T8)

Not implemented. Pepino would re-seed as `suggested` (not preserve prior user `confirmed` transition). Re-read does not preserve human confirmations in persisted layer.
