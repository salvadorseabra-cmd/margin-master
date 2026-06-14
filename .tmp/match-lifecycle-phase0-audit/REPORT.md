# Match Lifecycle Phase 0 — Read-Only Validation Audit

**Mode:** READ-ONLY · **Generated:** 2026-06-14  
**Verdict code:** **1** — Pure foundation, zero runtime behavior change

---

## Executive Summary

Phase 0 adds an empty `invoice_item_matches` table (migration) and four unwired TypeScript modules (`invoice-item-match-types`, `helpers`, `repository`, tests). Workspace-wide grep shows **zero production references** outside those Phase 0 files. No route, script, VL harness, or existing lib consumer imports the new modules.

Migration is additive-only: no `ALTER` on existing tables, no triggers on other tables, only RLS + `set_updated_at` on the new table. All invoice flows continue using virtual match resolution (`resolveInvoiceTableRowIngredientMatch` → `invoice-ingredient-match-propagation`).

VL scripts (`scripts/vl-cleanup-investigation.mts`) query `invoice_items`, `ingredient_aliases`, `ingredient_price_history` — not `invoice_item_matches`.

---

## Answers to All 6 Questions

### Q1 — Is `invoice_item_matches` referenced in key areas?

| Area | Referenced? |
|------|:-----------:|
| `invoices.tsx` | **No** |
| `ingredient-operational-intelligence.ts` | **No** |
| Ingredient matching pipeline | **No** |
| Review UI | **No** |
| Operational intelligence | **No** |
| Supplier intelligence | **No** |

See `READ_PATH_AUDIT.md` for full grep matrix.

---

### Q2 — Are any existing read paths using `invoice_item_matches`?

**No.** Repository read functions exist only in Phase 0 modules and are called **only from tests**. Current read path remains virtual matcher via `resolveInvoiceTableRowIngredientMatch`.

---

### Q3 — Are any existing write paths populating `invoice_item_matches` automatically?

**No.** `upsertInvoiceItemMatch`, `updateInvoiceItemMatchStatus`, and `mapMatcherOutputToInitialMatchRecord` have **test-only callers**. Extract/confirm/correct paths in `invoices.tsx` do not reference the table. No seed scripts present (deferred Phase 2).

See `WRITE_PATH_AUDIT.md`.

---

### Q4 — Does application behavior differ before vs after migration?

**No** (for Phase 0 scope).

| Layer | Before | After Phase 0 |
|-------|--------|---------------|
| DDL | Table absent | Empty table + indexes + RLS + self-scoped trigger |
| App reads | Virtual matcher | Unchanged (no code reads new table) |
| App writes | Legacy paths only | Unchanged (no code writes new table) |
| Bundle | N/A | New modules unimported → not in production bundle |
| Existing tables | Unchanged | Unchanged (no `ALTER`) |

RLS policies on the new table are inert until something queries it. FK CASCADE only deletes match rows when parent `invoice_items`/`invoices` are deleted — does not alter parent behavior.

---

### Q5 — Can all existing invoice flows run with `invoice_item_matches` completely empty?

**Yes.**

| Flow | Dependency on match records? |
|------|------------------------------|
| Extract (`invoices.tsx:1358`) | No — virtual match + optional Phase 1 gate |
| Review / confirm (`confirmIngredientMatch`) | No — alias/history writes only |
| Display (`resolveInvoiceTableRowIngredientMatch`) | No — virtual resolution |
| OI / supplier scan (`buildMatchedInvoiceProductsFromScan`) | No — virtual matcher |
| Catalog review | No — virtual matcher |
| VL harness | No — never queries table |

Empty table satisfies all constraints; no code path requires rows to exist.

---

### Q6 — Does Phase 0 create hidden dependency for Validation Lab?

**No runtime dependency.**

| Concern | Finding |
|---------|---------|
| VL scripts require table data? | No |
| VL scripts require table to exist? | No — no queries against it |
| Migration blocks VL? | No — additive DDL only |
| Future coupling? | Phase 2 shadow seed will populate rows; Phase 4 read cutover will depend on them — both deferred |
| Feature flags wired to match records? | No — only Phase 1 extract gate exists in code and does not touch match records |

`IMPLEMENTATION_PHASES.md` Phase 0 VL row: **"None — Schema invisible to app."**

---

## Scope Note

Phase 1 extract-cost gate (`match-lifecycle-flags.ts`, `ingredient-operational-intelligence.ts:967`) may exist on the branch separately from Phase 0. It changes extract sync when enabled but does **not** use `invoice_item_matches`.

---

## Artifacts

| File | Contents |
|------|----------|
| `REPORT.md` | This document |
| `READ_PATH_AUDIT.md` | Grep/import graph, read path analysis |
| `WRITE_PATH_AUDIT.md` | Write surface inventory |
| `VERDICT.md` | Verdict code 1 with evidence |

---

## Cross-References

- `.tmp/match-lifecycle-phase0-validation/validation-report.md`
- `.tmp/match-lifecycle-v1-implementation-plan/IMPLEMENTATION_PHASES.md`
- `.tmp/match-lifecycle-v1-design/SOURCE_OF_TRUTH_DESIGN.md`
