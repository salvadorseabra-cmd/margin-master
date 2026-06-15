# Repair Actions — Foundation Repair Phase 4D (Nata)

**Executed:** 2026-06-15 · VL project `bjhnlrgodcqoyzddbpbd`  
**Script:** `scripts/repair-nata-history.mts`

---

## Pre-repair scope note

Investigation docs truncated the April keep-row UUID suffix. Live DB keep row is `2767b722-0985-45a8-9c80-9e9dae611142` (prefix `2767b722` as scoped). Delete target `14330aad` was correct.

---

## Actions taken

| Action | Count | ID |
|---|---|---|
| DELETE (orphan suggested-match row) | 1 | `14330aad-cce1-4569-aa2f-4976dd1ac336` |
| KEEP (April confirmed) | 1 | `2767b722-0985-45a8-9c80-9e9dae611142` |
| UPDATE | 0 | — |
| Reconcile chain | 0 | Not required — single row remains |
| Catalog refresh | 0 | Unchanged at April confirmed 18.29 |
| Other ingredients touched | 0 | — |

---

## Execution log

1. **Dry-run** — scope_ok: true, backup written
2. **Execute** — delete 1 row, ok: true
3. **Post-check** — history_row_count: 1, current_price_from_latest_history: true

---

## Backup

| Field | Value |
|---|---|
| Path | `scripts/backups/nata-phase4d-pre-delete-2026-06-14T23-59-41.json` |
| Deleted row | `14330aad-cce1-4569-aa2f-4976dd1ac336` |
| SHA256 prefix | `7ae87a8346c0abe0` |

---

## Rollback (if ever needed)

Re-insert deleted row from backup JSON above. No catalog change expected on rollback (catalog was never driven by this row).

```sql
-- Restore from backup JSON fields; verify ingredient_id matches before insert
INSERT INTO ingredient_price_history (...)
VALUES (... row from backup ...);
```

---

## Git checkpoint

Pre-repair commit: **`eb5dd15`** — Checkpoint pre Phase 4D Nata readiness repair.
