# Emporio DB Integrity Investigation

**VL Invoice UUID:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb`  
**Live replacement:** `ab52796d-de1d-418d-86e7-230c8f056f09`  
**Generated:** 2026-06-13  
**Mode:** READ-ONLY — DB queries + artifact/code trace

---

## Executive Summary

**Root cause:** The VL Emporio invoice was **fully deleted** via manual `removeRow()` in the UI — not an empty-extraction wipe. `invoice_items` has `ON DELETE CASCADE` from `invoices`, so deleting the parent removed all line items.

**Why DB = 0 but v31 = 8:** UUID `17aa3591` **no longer exists** in the database. v31 extraction works fine on the Emporio PNG (geometry-audit image). **Live Emporio data** exists under replacement invoice `ab52796d` with **8 items**.

**Confidence:** 91%

---

## Current DB State (queried 2026-06-13)

| Record | Exists? | Items | Price history |
|--------|---------|-------|---------------|
| `17aa3591` (VL UUID) | **NO** | 0 | 0 |
| `ab52796d` (replacement) | **YES** | **8** | 0 |

Replacement invoice: Emporio Italia, €327.46, created `2026-06-11T22:53:16Z`, items persisted `2026-06-11T23:37:47Z`.

---

## Timeline

| When | Event | Items | Invoice ID |
|------|-------|-------|--------------|
| Jun 10 18:27 | Initial upload + extraction | 8 | `17aa3591` |
| Jun 11 22:41 | Concurrent re-read race | **16** (duplicate) | `17aa3591` |
| Jun 11 22:53 | Replacement invoice uploaded | 0 | `ab52796d` |
| Jun 11 23:37 | Replacement extraction | 8 | `ab52796d` |
| Jun 11–13 | **Original invoice deleted** | 0 | `17aa3591` **gone** |
| Jun 12 | Re-read safety fix deployed | — | guards future wipes |
| Jun 13 | v31 audit extract (PNG) | 8 | N/A (no DB write) |

---

## Deletion Path Analysis

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| **Manual invoice delete** | **YES — primary** | `invoices` row absent; only `removeRow()` deletes parent (`invoices.tsx:2186`) |
| Empty extraction wipe | **NO** | `runExtraction` DELETEs `invoice_items` only; leaves `invoices` row |
| Re-read DELETE without INSERT | **NO** | Would leave invoice header; items=0 but invoice exists |
| Concurrent duplicate race | **Contributing** | 16-row mess on Jun 11 → user re-uploaded + deleted original |
| Stale local state | **NO** | `service_role` query confirms server-side absence |

### Code paths

**`runExtraction`** (re-read) — deletes `invoice_items` only:

```1307:1310:src/routes/invoices.tsx
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
```

**`removeRow`** (manual delete) — deletes entire invoice:

```2186:2189:src/routes/invoices.tsx
  const removeRow = async (row: InvoiceRow) => {
    const affectedIngredientIds = await collectIngredientIdsForInvoiceHistory(supabase, row.id);
    if (row.file_path) await supabase.storage.from("invoices").remove([row.file_path]);
    const { error: deleteError } = await supabase.from("invoices").delete().eq("id", row.id);
```

Schema cascade:

```3:4:supabase/migrations/20260511115814_625d8b2b-28d8-4400-b815-d2e6173f063e.sql
  invoice_id uuid not null references public.invoices(id) on delete cascade,
```

No soft-delete, no `deleted_at`, no audit log table on `invoice_items`.

---

## Prior Incidents (context)

### Jun 11 — Duplicate row race (`17aa3591`)

From [emporio-duplicate-audit](.tmp/emporio-duplicate-audit/REPORT.md):
- Re-read **did** DELETE old 8 rows
- Two concurrent `runExtraction` calls → **16 rows** (two INSERT batches 9ms apart)
- Pre-mutex fix (fixed Jun 12 in [reread-safety-fix-validation](.tmp/reread-safety-fix-validation/))

### Jun 11 — Aviludo April empty wipe (different invoice)

From [aviludo-reread-audit](.tmp/aviludo-reread-audit/REPORT.md):
- Empty `items:[]` → DELETE all 9 rows, no INSERT
- **Recovered** Jun 12 re-read (now 9 items in DB)
- Same bug class, but **not** what happened to Emporio's final state

---

## Other VL Invoices Affected?

**No.** Only Emporio VL UUID was deleted.

| Invoice | ID | Status | Items |
|---------|-----|--------|-------|
| Bidfood | `da472b7f` | OK | 11 |
| Aviludo April | `c2f52357` | OK (recovered) | 9 |
| Aviludo May | `3b4cb21f` | OK | 8 |
| Bocconcino | `f0aa5a08` | OK | 7 |
| **Emporio VL** | `17aa3591` | **DELETED** | 0 |
| **Emporio live** | `ab52796d` | OK | 8 |
| Mammafiore | `36c99d19` | OK | 8 |

---

## Operational Impact

| System | Impact |
|--------|--------|
| **Invoice list** | VL UUID invisible; Emporio shows as `ab52796d` |
| **Dashboard totals** | Emporio contributes via replacement (€327.46 header, 8 lines) |
| **Ingredient matching** | Works on `ab52796d` items; no confirmed Emporio aliases in DB |
| **Price history** | 0 rows for either Emporio invoice — no stale inflation signals |
| **Opportunities / margin alerts** | No Emporio-linked price_history — minimal stale signal risk |
| **Supplier intelligence** | Scan includes `ab52796d` lines; excludes deleted UUID |
| **VL harness** | All audits using `17aa3591` will see 0 DB rows — fixture drift |

---

## Data Loss Risk Assessment

| Risk | Level | Notes |
|------|-------|-------|
| Operational data loss | **LOW** | Replacement invoice has 8 rows |
| Orphan price_history | **NONE** | 0 rows for deleted UUID |
| Ghost purchases | **NONE** | CASCADE cleaned items |
| Repeat wipe (post Jun 12 fix) | **LOW** | Empty guard + mutex in `runExtraction` |
| VL fixture drift | **MEDIUM** | Harnesses reference deleted UUID |

---

## Recommendations

1. **Update VL fixtures** to use `ab52796d` or re-seed `17aa3591` if UUID stability is required for harnesses
2. **Re-read `ab52796d`** with v31 when ready — current items are Jun 11 extraction (stale vs v31)
3. **No recovery needed** for `17aa3591` — deletion appears intentional after duplicate incident
4. vl-final-state audit "Emporio CRITICAL 0 rows" is **correct for VL UUID** but **misleading** — live Emporio exists under new ID

---

## Artifacts

| File | Contents |
|------|----------|
| `root-cause.json` | Verdict, paths, impact |
| `timeline.json` | Reconstructed event sequence |
| `affected-invoices.json` | All 6 VL invoices + replacement |
| `db-query.json` | Live Supabase query results |
| `query-db.mts` | Reproducible query harness |
