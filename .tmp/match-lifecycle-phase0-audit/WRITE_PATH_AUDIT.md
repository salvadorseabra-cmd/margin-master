# Match Lifecycle Phase 0 — Write Path Audit

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Summary

**Automatic population: none.**  
**Production write paths: 0**

---

## Write Surfaces

| Location | Function / operation | Category | Production caller? |
|----------|---------------------|----------|-------------------|
| `invoice-item-match-repository.ts:63` | `upsertInvoiceItemMatch` → `.upsert(...)` | Repository | **No** — test only |
| `invoice-item-match-repository.ts:96` | `updateInvoiceItemMatchStatus` → `.update(...)` | Repository | **No** — test only |
| `invoice-item-match-helpers.ts:115` | `mapMatcherOutputToInitialMatchRecord` | Pure mapper (no I/O) | **No** — test only |
| `invoice-item-match-repository.test.ts` | calls upsert/update | Test | N/A |
| `invoice-item-match-helpers.test.ts` | calls mapper | Test | N/A |
| Migration trigger `trg_invoice_item_matches_updated` | `set_updated_at()` on UPDATE | DB — new table only | Only fires on writes to new table |
| Seed / shadow scripts | — | **Not present** (deferred Phase 2) | N/A |
| `invoices.tsx` extract/confirm/correct | — | Legacy writes to aliases/history | Unchanged |

---

## Q3 — Automatic Population?

**No.**

| Write surface | Status |
|---------------|--------|
| `upsertInvoiceItemMatch` | Repository only; **test-only caller** |
| `updateInvoiceItemMatchStatus` | Repository only; **test-only caller** |
| `mapMatcherOutputToInitialMatchRecord` | Helper only; **test-only caller** |
| Extract / confirm / correct in `invoices.tsx` | No references |
| Seed / admin scripts | 0 hits in `scripts/` |
| DB triggers on `invoice_items` / `invoices` | None; only `trg_invoice_item_matches_updated` on the new table |

Migration FKs are **from** `invoice_item_matches` **to** parent tables (CASCADE on parent delete). No reverse triggers or functions populate the new table.

---

## Legacy Write Paths (Unchanged)

- Extract: `invoices.tsx:1358` → `syncOperationalIngredientCostsFromInvoiceLines` → aliases/history (not match records)
- Confirm: `confirmIngredientMatch` → `persistIngredientCorrectionForItem` → alias UPSERT + cost sync
- Correct: `handleSelectCorrectionIngredient` → same persist path

None touch `invoice_item_matches`.
