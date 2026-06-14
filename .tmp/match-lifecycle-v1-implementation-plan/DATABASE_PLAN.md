# Match Lifecycle V1 — Database Plan

**Mode:** READ-ONLY schema design · **Generated:** 2026-06-14  
**Constraint:** Describes schema changes only. **No migration SQL.**

---

## Overview

Option B introduces one primary SoT table binding each invoice line to match assignment and lifecycle status. Existing tables remain; pricing tables become materialized projections gated by match status (`.tmp/match-lifecycle-v1-design/PRICING_OWNERSHIP.md`).

---

## New Table: `invoice_item_matches`

### Purpose

One row per `invoice_item_id` — closes foundations gap: *"no existing table binds line → ingredient → status → history atomically"* (`.tmp/match-lifecycle-foundations-audit/FINAL_VERDICT.md`).

### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|:--------:|---------|-------------|
| `invoice_item_id` | `uuid` | NO | — | **PK**; FK → `invoice_items(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NO | — | FK → `auth.users`; denormalized for RLS (matches `invoice_items` pattern) |
| `invoice_id` | `uuid` | NO | — | FK → `invoices(id)` ON DELETE CASCADE; denormalized for queries |
| `ingredient_id` | `uuid` | YES | NULL | FK → `ingredients(id)` ON DELETE SET NULL; NULL when `status=unmatched` |
| `status` | `text` | NO | — | CHECK ∈ `('unmatched','suggested','confirmed')` |
| `match_kind` | `text` | YES | NULL | Matcher provenance: `exact`, `semantic`, `confirmed-alias`, `manual`, etc. |
| `confirmed_at` | `timestamptz` | YES | NULL | Set when `status` becomes `confirmed` |
| `previous_ingredient_id` | `uuid` | YES | NULL | FK → `ingredients(id)` ON DELETE SET NULL; audit trail for correct/reassign |
| `pack_variant_id` | `uuid` | YES | NULL | **Reserved for P1** — no FK until `pack_variants` table exists |
| `created_at` | `timestamptz` | NO | `now()` | Row creation |
| `updated_at` | `timestamptz` | NO | `now()` | Last lifecycle transition |

### Constraints

| Constraint | Definition | Rationale |
|------------|------------|-----------|
| `pk_invoice_item_matches` | PRIMARY KEY (`invoice_item_id`) | Enforces 1:1 with line |
| `chk_status_values` | `status IN ('unmatched','suggested','confirmed')` | Three-status V1 model (`.tmp/match-lifecycle-v1-design/LIFECYCLE_STATE_MACHINE.md`) |
| `chk_unmatched_no_ingredient` | `status != 'unmatched' OR ingredient_id IS NULL` | Unmatched = explicit tombstone |
| `chk_confirmed_has_ingredient` | `status != 'confirmed' OR ingredient_id IS NOT NULL` | Confirmed requires assignment |
| `chk_confirmed_has_timestamp` | `status != 'confirmed' OR confirmed_at IS NOT NULL` | Audit requirement |
| `fk_invoice_item` | `invoice_item_id` → `invoice_items(id)` CASCADE | Line binding |
| `fk_invoice` | `invoice_id` → `invoices(id)` CASCADE | Invoice-scoped queries |
| `fk_ingredient` | `ingredient_id` → `ingredients(id)` SET NULL | Catalog reference |
| `fk_previous_ingredient` | `previous_ingredient_id` → `ingredients(id)` SET NULL | Correction trail |

**Deferred:** `corrected` / `reassigned` as statuses — they are transitions, not states (`.tmp/match-lifecycle-v1-design/LIFECYCLE_STATE_MACHINE.md` §Design Question).

### Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_iim_user_id` | `(user_id)` | RLS + user-scoped listing |
| `idx_iim_invoice_id` | `(invoice_id)` | Load all matches for invoice review |
| `idx_iim_ingredient_status` | `(ingredient_id, status)` WHERE `ingredient_id IS NOT NULL` | Catalog review counts |
| `idx_iim_status` | `(status)` WHERE `status = 'suggested'` | Review queue queries |
| `idx_iim_pack_variant` | `(pack_variant_id)` WHERE `pack_variant_id IS NOT NULL` | P1 variant queries (empty until P1) |

### RLS Policies

Mirror `invoice_items` ownership:

| Policy | Operation | Rule |
|--------|-----------|------|
| `invoice_item_matches_select_own` | SELECT | `user_id = auth.uid()` |
| `invoice_item_matches_insert_own` | INSERT | `user_id = auth.uid()` AND invoice/item ownership verified |
| `invoice_item_matches_update_own` | UPDATE | `user_id = auth.uid()` |
| `invoice_item_matches_delete_own` | DELETE | `user_id = auth.uid()` (admin remediation only) |

### Triggers (optional V1)

| Trigger | Action |
|---------|--------|
| `set_updated_at` | Bump `updated_at` on UPDATE |
| `validate_invoice_item_ownership` | Ensure `invoice_item_id` belongs to same `user_id` |

---

## New Table (Phase 7): `ingredient_match_rejections`

Promote client localStorage reject pairs to server SoT (`.tmp/match-lifecycle-v1-design/SOURCE_OF_TRUTH_DESIGN.md` §Entity Classification).

| Column | Type | Nullable | Description |
|--------|------|:--------:|-------------|
| `id` | `uuid` | NO | PK |
| `user_id` | `uuid` | NO | Owner |
| `normalized_item_name` | `text` | NO | Wording key |
| `rejected_ingredient_id` | `uuid` | NO | FK → `ingredients` |
| `supplier_name` | `text` | YES | Scoped rejection |
| `raw_item_names` | `text[]` | YES | Variant wordings |
| `created_at` | `timestamptz` | NO | `now()` |

**Unique constraint:** `(user_id, normalized_item_name, rejected_ingredient_id, coalesce(supplier_name,''))`

**Indexes:** `(user_id)`, `(user_id, normalized_item_name)`

---

## Existing Tables — No Structural Change (V1)

### `invoice_items`

**Unchanged.** No `ingredient_id` or `match_status` column — lifecycle lives in `invoice_item_matches` (`.tmp/match-lifecycle-v1-design/SOURCE_OF_TRUTH_DESIGN.md` §Entity Classification).

Current schema (`supabase/migrations/20260511115814_*.sql`): `id, invoice_id, user_id, name, quantity, unit, unit_price, total, created_at, updated_at`.

### `ingredient_price_history`

**Retained as materialized projection.** No DDL required for V1 gate.

| Aspect | Today | V1 behavior change (app-level) |
|--------|-------|--------------------------------|
| Key identity | `(invoice_id, ingredient_id)` | Attribution via match record; no `invoice_item_id` FK yet |
| Write trigger | Extract + manual | **Confirmed match transitions only** |
| Delete trigger | Invoice delete, manual admin | **Unmatch + correct-away** |
| RLS DELETE | Enabled (`20260609120000_*.sql`) | Required for subtractive semantics |

**Optional V1.1 column (not required for launch):**

| Column | Type | Purpose |
|--------|------|---------|
| `invoice_item_id` | `uuid` FK → `invoice_items` | Precise row attribution; simplifies DELETE on unmatch |

Evidence: history lacks line FK today (`.tmp/match-lifecycle-foundations-audit/SOURCE_OF_TRUTH_MATRIX.json`); Pepino orphan persists because DELETE is not wired (`.tmp/match-correction-reversal-audit/REPORT.md`).

### `ingredients`

**Unchanged schema.** `current_price` remains materialized snapshot; revert via `reconcileIngredientPriceHistoryChain` (`.tmp/match-lifecycle-v1-design/PRICING_OWNERSHIP.md`).

### `ingredient_aliases`

**Unchanged schema.** Write authority moves to confirm/correct transitions only; no auto-extract alias writes.

---

## Seed Data Plan (Option B — no SQL)

For each `invoice_item` in VL + production:

| Source state | Seed `status` | Seed `ingredient_id` | History action |
|--------------|---------------|----------------------|----------------|
| Matcher null (40/51 VL) | `unmatched` | NULL | None |
| `displayState=suggested` (4/51) | `suggested` | matcher id | DELETE extract-synced history if any |
| `displayState=confirmed` + alias (7/51) | `confirmed` | matcher id | Keep attributable history |
| `displayState=confirmed` + no alias (Pepino class, ~4 of 11) | `suggested` | matcher id | **DELETE** orphan history rows |
| Manual alias only (no history) | `confirmed` | alias target | Keep |

Counts from `.tmp/remove-match-investigation/query-summary.json`:
- 51 items, 40 unmatched, 7 confirmed, 4 suggested, 11 extract-sync would run, 20 price_history rows on VL invoices.

**Pepino seed (critical):**

| Field | Value |
|-------|-------|
| `invoice_item_id` | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| `status` | `suggested` (NOT `confirmed`) |
| `ingredient_id` | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |
| `match_kind` | `exact` |
| History remediation | DELETE `a689bd91` |

Evidence: Pepino had `kind: exact`, no alias, pre-review history (`.tmp/pepino-contamination-timeline/REPORT.md`).

---

## P1 Forward Compatibility (schema-only, no implementation)

| Addition | When |
|----------|------|
| `pack_variants` table + FK on `invoice_item_matches.pack_variant_id` | Pack Variants P1 |
| `invoice_item_id` on `ingredient_price_history` | V1.1 or P1 |
| `previous_pack_variant_id` on `invoice_item_matches` | P1 |

Nullable `pack_variant_id` in V1 schema avoids second lifecycle rewrite (`.tmp/match-lifecycle-v1-design/PACK_VARIANT_INTEGRATION.md` §P1 Additive Extension).

---

## What NOT to Add (V1)

| Anti-pattern | Why |
|--------------|-----|
| `match_lifecycle_events` event store | Option C deferred (`.tmp/match-lifecycle-v1-design/MIGRATION_OPTIONS.md`) |
| `ingredient_id` on `invoice_items` | Duplicates SoT; breaks 1:1 match record model |
| `status` on `invoice_items` | Same |
| Persisted `corrected` / `reassigned` statuses | Transitions only (`.tmp/match-lifecycle-v1-design/LIFECYCLE_STATE_MACHINE.md`) |

---

## Evidence Index

| Schema fact | Source |
|-------------|--------|
| `invoice_items` no ingredient_id | `supabase/migrations/20260511115814_*.sql`; `.tmp/match-lifecycle-foundations-audit/FINAL_VERDICT.md` |
| `ingredient_price_history` columns | `supabase/migrations/20260513231000_ingredient_price_history.sql` |
| DELETE RLS on history | `supabase/migrations/20260609120000_ingredient_price_history_update_delete_rls.sql` |
| VL seed counts | `.tmp/remove-match-investigation/query-summary.json` |
| Pepino identifiers | `.tmp/pepino-contamination-timeline/REPORT.md` |
