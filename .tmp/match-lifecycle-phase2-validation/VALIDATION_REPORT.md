# Phase 2 Validation Report

**Date:** 2026-06-14 · **Mode:** Unit tests + static analysis (no live VL DB apply in CI)

## Count model

| Metric | Source |
|--------|--------|
| `invoice_items` count | All rows targeted by backfill |
| `invoice_item_matches` count | Rows in shadow table |
| Missing | `invoice_item_id` in items but not in matches |
| Orphans | Match rows whose `invoice_item_id` ∉ items |
| Duplicates | Same `invoice_item_id` > 1 (PK prevents in DB; reported if data corrupt) |

Implemented in `computeInvoiceItemMatchCoverage()` and emitted by backfill script JSON.

## Unit validation results

| Check | Result |
|-------|--------|
| Unmatched creation (matcher null) | PASS |
| Suggested creation (Pepino / memory / exact paths) | PASS |
| Confirmed creation (alias-backed) | PASS |
| Idempotent upsert payloads | PASS |
| Flag OFF → no extract writes | PASS |
| Repository CRUD unchanged | PASS |

## Static behavioral guarantees

| Guarantee | Evidence |
|-----------|----------|
| No read-path imports of shadow table | Grep: only repository + shadow-seed + script reference `invoice_item_matches` |
| Review UI unchanged | `resolveInvoiceTableRowIngredientMatch` still sole display authority |
| Cost sync unchanged | Phase 1 gate untouched; shadow runs after sync |
| Flag default OFF | `isMatchLifecycleShadowSeedEnabled` returns false unless explicit enable |

## VL sign-off checklist (manual — requires service role)

- [ ] Run migration `20260614120000_invoice_item_matches.sql` on VL project
- [ ] `npm run backfill:invoice-item-matches -- --dry-run` → 51/51 coverage
- [ ] Pepino line `8e9e727a` → `status=suggested`, `ingredient_id=635a1189`
- [ ] Compare `byStatus` to `.tmp/remove-match-investigation/query-summary.json`
- [ ] Re-extract Bidfood with flag ON → match rows upserted; UI display unchanged
- [ ] `scripts/vl-cleanup-investigation.mts` baseline unchanged with flag OFF

## Validation questions (final)

1. **Application behavior unchanged?** Yes — shadow writes are additive and flag-gated; reads unchanged.
2. **Deletable / recreatable?** Yes — derived from matcher + aliases; backfill restores.
3. **Idempotent?** Yes — PK upsert; tested.
4. **All lines representable?** Yes — three-state model covers null and all match kinds.
5. **VL operational?** Yes — no harness dependency on new table when flag OFF.
