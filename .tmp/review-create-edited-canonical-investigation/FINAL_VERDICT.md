# Final Verdict — Edited Canonical Persistence

**Date:** 2026-06-15

---

## Answers

| Question | Answer |
|----------|--------|
| Ingredients created? | Highly likely yes (user saw "Matched to"). Not verified in live DB. |
| Names persisted? | Almost certainly suggestion names (`Stracciatella 250gr`, `Mezzi paccheri mancini`) — not edited shorter names. |
| Edits reached DB? | Code path: yes if `row.canonicalName` at submit had edits. Observed UI: **no**. |
| Matching overrode intent? | **No evidence.** Post-create links alias + match to created `ingredientId`; does not rewrite `ingredients.name`. |
| Root cause | **A — Persistence failure** (bulk sheet state reset on `candidates` change) |

---

## Recommended fix scope

| Priority | Action |
|----------|--------|
| **P0** | Fix `BulkCanonicalIngredientCreateSheet` — initialize rows only on `open` transition, not every `candidates` reference change |
| **P1** | Regression test: bulk submit with edited `canonicalName` asserts `persistIngredientFromInvoiceItem` receives edited `payload.name` |
| **P1** | Compare `[canonical_confirmed_name]` trace at submit vs insert-ok |
| **P2** | On guard reuse, surface warning when `values.canonicalName !== guard.existing.name` |
| **Verify** | Query live `ingredients` + `ingredient_aliases` for Bocconcino item IDs |

---

## Summary

Save chain correctly uses user-edited `canonicalName` when it reaches submit. The bug is upstream: edits are likely wiped before submit by the bulk sheet's `useEffect` dependency on `candidates`. Not a matching or stale-UI issue.
