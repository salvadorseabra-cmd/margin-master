# Repair Actions — Historical Pricing Repair Phase 4B

**Executed:** 2026-06-15 · VL `bjhnlrgodcqoyzddbpbd`  
**Checkpoint commit:** `efd89cdaf5f84a58dacd5234190bbaa37ba04281`

---

## Script

`scripts/repair-created-at-history.mts`

```bash
# Dry-run (scope + backup)
npx vite-node scripts/repair-created-at-history.mts

# Execute
npx vite-node scripts/repair-created-at-history.mts --execute
```

---

## Action taken

**UPDATE** `created_at` only — no price/delta/schema changes.

| Field | Before | After |
|---|---|---|
| `created_at` | `2023-05-19T12:00:00+00:00` | `2026-05-19T12:00:00.000Z` |

**Rows updated:** 7 (exact IDs below)  
**Invoice guard:** `invoice_id = 3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2`

| History ID | Ingredient |
|---|---|
| `edc6c627-d934-40de-8eb8-cc0a25d36755` | Arroz agulha |
| `14330aad-cce1-4569-aa2f-4976dd1ac336` | Nata culinária |
| `908de185-e61a-4f41-af4c-3b70f69bd08f` | Anchoas |
| `1d9d5133-724b-461c-b141-605392f2b64d` | Açúcar branco |
| `781ab1ac-39d2-4462-9106-635e5603c466` | Atum em óleo |
| `e143080d-511b-4c37-9018-11949343aedc` | Gema líquida |
| `bf250ee4-388a-480f-96d7-e8c0e8e8dfb2` | Chocolate culinária |

**Untouched:** Pepino `5bd9a4e1-713f-4474-9985-f46bdb1b36b0` (already `2026-05-19`)

---

## Backup

`scripts/backups/created-at-phase4b-pre-update-2026-06-14T23-21-36.json`

Contains full row snapshots + catalog `current_price` before update.  
Rollback: restore `created_at` from backup values (prices unchanged).

---

## Reconciliation

**Not required** — only timestamp field changed; `new_price`, `previous_price`, `delta`, `delta_percent` preserved.

---

## Execution note

First execute attempt failed on `.like("created_at", ...)` (timestamp incompatible with LIKE).  
Second attempt applied all 7 updates successfully; Supabase returned `count: null` without `{ count: "exact" }` — verified via direct DB query.
