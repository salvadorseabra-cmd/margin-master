# Migration Report — Match Lifecycle VL Activation

**Generated:** 2026-06-14 · **Project:** bjhnlrgodcqoyzddbpbd (marginly-validation-lab)

---

## Pre-Activation State

| Check | Result |
|-------|--------|
| Linked project | `bjhnlrgodcqoyzddbpbd` (confirmed via `supabase/.temp/linked-project.json`) |
| Migration `20260614120000` on remote | **Not applied** — empty remote column in `supabase migration list --linked` |
| Table `invoice_item_matches` | **Absent** (prior readiness audit: `to_regclass()` → null) |

---

## Commands Run

### 1. Migration list (before)

```bash
cd /Users/salvadorseabra1/margin-master
supabase migration list --linked
```

**Result:** `20260614120000 | | 2026-06-14 12:00:00` — local only, remote blank.

### 2. Apply migration

```bash
supabase db push --linked
```

**Result:** Success — applied `20260614120000_invoice_item_matches.sql`.

```
Applying migration 20260614120000_invoice_item_matches.sql...
Finished supabase db push.
```

### 3. Migration list (after)

```bash
supabase migration list --linked | grep 20260614120000
```

**Result:** `20260614120000 | 20260614120000 | 2026-06-14 12:00:00` — local and remote aligned.

### 4. Table existence probe

```bash
supabase db query --linked "SELECT status, count(*) AS cnt FROM invoice_item_matches GROUP BY status ORDER BY status;"
```

**Result:** Query succeeded (after intermittent pooler retries). Table exists with rows post-backfill.

---

## Migration Contents Applied

- Table `public.invoice_item_matches` with PK on `invoice_item_id` → `invoice_items(id) ON DELETE CASCADE`
- FK `invoice_id` → `invoices(id) ON DELETE CASCADE`
- Status check constraint: `unmatched | suggested | confirmed`
- RLS policies (select/insert/update/delete own)
- Indexes on `user_id`, `invoice_id`, `ingredient_id+status`, `status`, `pack_variant_id`
- `trg_invoice_item_matches_updated` trigger

---

## Outcome

| Item | Status |
|------|--------|
| Migration applied on VL | **PASS** |
| Table created | **PASS** |
| CASCADE FK for re-read | **Deployed** (validated in REREAD_VALIDATION.md) |

**Migration verdict:** SUCCESS — P0 blocker from readiness audit resolved.
