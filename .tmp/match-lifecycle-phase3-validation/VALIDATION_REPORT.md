# Phase 3 — Validation Report

**Date:** 2026-06-14 · **Scope:** Dual-write only; flag default OFF

## Validation questions

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | UI behavior unchanged? | **Yes** | No UI component changes; dual-write is fire-and-forget after existing success paths; flag default OFF |
| 2 | Review workflow unchanged? | **Yes** | `resolveInvoiceTableRowIngredientMatch` untouched; display state still from virtual matcher + aliases |
| 3 | Lifecycle records updated after confirm? | **Yes (when flag ON)** | `confirmMatch` sets `status=confirmed`, `confirmed_at`, preserves `ingredient_id` / `match_kind` |
| 4 | Lifecycle records updated after correction? | **Yes (when flag ON)** | `correctMatch` / `reassignMatch` set `ingredient_id`, `previous_ingredient_id`, `corrected_at`, `match_kind=manual` |
| 5 | Dual-write disableable safely? | **Yes** | `isMatchLifecycleDualWriteEnabled()` default false; MLS returns `{ skipped: true }`; zero DB writes verified in test |
| 6 | `invoice_item_matches` tracking user actions? | **Yes (when flag ON)** | Confirm, manual pick, correction, canonical create paths dual-write after legacy persist |
| 7 | VL still operational? | **Yes** | No read-path dependency; VL harnesses and virtual matcher unchanged when flag OFF |

## Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dual-write / legacy drift if MLS fails silently | Low | Console errors; legacy remains authoritative for reads and pricing |
| Missing seed row on first confirm | Low | MLS upserts confirmed row when none exists |
| Double-write with shadow seed | Low | Upsert on PK is idempotent; user action overwrites with authoritative transition |
| Correction misclassified suggested vs confirmed | Medium | `wasConfirmed` captured from `displayState` at correction open; matches virtual UI state |

## VL impact

**None when flag OFF (production default).** Validation Lab continues to use virtual matcher and existing review semantics. Enabling dual-write populates/updates shadow rows without affecting VL read paths or metrics.

## Rollback

Set `VITE_MATCH_LIFECYCLE_DUAL_WRITE=false` (or unset). No migration rollback required; `invoice_item_matches` rows are additive projections.

## Recommended next phase

**Phase 4 — Read-path cutover**

1. Validate shadow seed + dual-write coverage (counts, Pepino line = suggested until confirm)
2. Add read flag; update `resolveInvoiceTableRowIngredientMatch` resolution order
3. Update catalog review and OI scan consumers
4. Dual-read tests before demoting virtual matcher

Do **not** enable subtractive correction cleanup or Remove Match UI until Phase 4 SoT is live (Phase 5).
