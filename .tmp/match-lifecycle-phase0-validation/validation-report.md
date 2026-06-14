# Match Lifecycle V1 — Phase 0 Validation Report

**Generated:** 2026-06-14  
**Scope:** Schema foundation + TypeScript layer only (zero runtime behavior change)

---

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260614120000_invoice_item_matches.sql` | DDL for `invoice_item_matches` table, indexes, RLS, `updated_at` trigger |
| `src/lib/invoice-item-match-types.ts` | Status enum, row/insert/update DTOs |
| `src/lib/invoice-item-match-helpers.ts` | Status validation, normalization, matcher→record mapper |
| `src/lib/invoice-item-match-repository.ts` | CRUD: getByInvoiceItemId, getByInvoiceId, upsert, updateStatus |
| `src/lib/invoice-item-match-helpers.test.ts` | Unit tests for helpers and mapper (12 tests) |
| `src/lib/invoice-item-match-repository.test.ts` | Unit tests for repository with mock Supabase (6 tests) |

## Files Changed

None (additive-only Phase 0).

---

## Migration Summary

**Table:** `public.invoice_item_matches`

| Column | Type | Notes |
|--------|------|-------|
| `invoice_item_id` | uuid PK | FK → `invoice_items(id)` CASCADE |
| `user_id` | uuid NOT NULL | FK → `auth.users`; denormalized for RLS |
| `invoice_id` | uuid NOT NULL | FK → `invoices(id)` CASCADE |
| `ingredient_id` | uuid NULL | FK → `ingredients(id)` SET NULL |
| `status` | text NOT NULL | CHECK ∈ `unmatched`, `suggested`, `confirmed` |
| `match_kind` | text NULL | Matcher provenance |
| `confirmed_at` | timestamptz NULL | Required when `status=confirmed` |
| `corrected_at` | timestamptz NULL | Audit trail for future correct/reassign (Phase 3+) |
| `previous_ingredient_id` | uuid NULL | FK → `ingredients(id)` SET NULL |
| `pack_variant_id` | uuid NULL | Reserved for P1; no FK yet |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger on UPDATE |

**Constraints:** Three-status CHECK; unmatched→no ingredient; confirmed→ingredient + `confirmed_at`.

**Indexes:** `user_id`, `invoice_id`, `(ingredient_id, status)` partial, `(status)` where suggested, `(pack_variant_id)` partial.

**RLS:** Mirrors `invoice_items` ownership — select/insert/update/delete require `auth.uid() = user_id` plus parent `invoice_items` / `invoices` ownership chain on insert/update.

---

## Test Results

```
npm test -- src/lib/invoice-item-match-helpers.test.ts src/lib/invoice-item-match-repository.test.ts

Test Files  2 passed (2)
Tests       18 passed (18)
```

Coverage highlights:
- Status validation (three states only; rejects corrected/reassigned as statuses)
- Unmatched/confirmed constraint rules
- `normalizeMatchStatusUpdate` (unmatch clears assignment; confirm stamps timestamp)
- `mapMatcherOutputToInitialMatchRecord` (null→unmatched, semantic→suggested, alias→confirmed)
- Repository CRUD with mock Supabase client

---

## Explicitly NOT Implemented (Phase 1+ Boundaries)

| Area | Deferred to |
|------|-------------|
| Pack Variants table / FK on `pack_variant_id` | P1 |
| Match Lifecycle Service transition orchestration (T1–T8) | Phase 3 |
| Extract sync wiring / read-path cutover | Phases 3–4 |
| Shadow seed script (mutating production data) | Phase 2 |
| UI changes (`invoices.tsx` review, Remove Match) | Phase 5 |
| Data remediation (Pepino history DELETE, ghost rows) | Phase 6 |
| `ingredient_match_rejections` server table | Phase 7 |
| Feature flags wired to app (`MATCH_LIFECYCLE_READ_FROM_RECORD`, etc.) | Phases 2–7 |
| Lifecycle transition logic for `corrected_at` / `previous_ingredient_id` | Phase 3+ |
| Supabase generated types update (`src/integrations/supabase/types.ts`) | Optional follow-up |

**Runtime impact:** Zero. No existing code imports the new modules. VL extract/review behavior unchanged.

---

## Git Checkpoint Recommendation

Suggested commit message (do not commit unless requested):

```
Add invoice_item_matches schema foundation for Match Lifecycle V1 Phase 0.

Introduces persisted per-line match SoT table with RLS, TypeScript types,
repository CRUD, and validation helpers — no app wiring yet.
```

Suggested branch name: `feat/match-lifecycle-phase0-schema`

Apply migration locally: `supabase db push` or run migration in target environment before Phase 2 seed work.
