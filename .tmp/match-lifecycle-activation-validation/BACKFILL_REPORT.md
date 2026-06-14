# Backfill Report — invoice_item_matches (VL)

**Generated:** 2026-06-14 · **Project:** bjhnlrgodcqoyzddbpbd

---

## Prerequisites Configured

Service role key retrieved via:

```bash
supabase projects api-keys --project-ref bjhnlrgodcqoyzddbpbd
```

Added to `.env.local` (git-untracked, VL-only):

```
SUPABASE_SERVICE_ROLE_KEY=<service_role>
VITE_MATCH_LIFECYCLE_SHADOW_SEED=true
VITE_MATCH_LIFECYCLE_DUAL_WRITE=true
# VITE_MATCH_LIFECYCLE_EXTRACT_GATE omitted — default ON
```

Production env files (`.env`, `.env.production-backup`) were **not modified**.

---

## Dry Run

```bash
npm run backfill:invoice-item-matches -- --dry-run
```

**Exit code:** 0

| Metric | Value |
|--------|------:|
| Mode | `dry-run` |
| Attempted | 51 |
| Upserted (projected) | 51 |
| Skipped | 0 |
| Errors | 0 |
| Pre-existing match rows | 0 |
| Missing (pre-backfill) | 51 (expected — table empty) |

**Projected `byStatus`:**

| Status | Count |
|--------|------:|
| unmatched | 40 |
| suggested | 5 |
| confirmed | 6 |

No destructive operations — dry-run confirmed full coverage projection.

---

## Apply

```bash
npm run backfill:invoice-item-matches
```

**Exit code:** 0 · **Duration:** ~15s

| Metric | Value |
|--------|------:|
| Mode | `apply` |
| Attempted | 51 |
| Upserted | 51 |
| Skipped | 0 |
| Errors | 0 |

**Post-apply `byStatus`:**

| Status | Count |
|--------|------:|
| unmatched | 40 |
| suggested | 5 |
| confirmed | 6 |

**Coverage block:**

```json
{
  "invoiceItemsCount": 51,
  "matchRecordsCount": 51,
  "missingInvoiceItemIds": [],
  "orphanMatchInvoiceItemIds": [],
  "duplicateInvoiceItemIds": []
}
```

---

## Outcome

| Check | Result |
|-------|--------|
| 51/51 coverage | **PASS** |
| Idempotent upsert | **PASS** (0 errors) |
| Destructive ops | **None** (upsert only; no orphan deletion) |
| Taxonomy matches projection | **PASS** (40/5/6) |

**Backfill verdict:** SUCCESS
