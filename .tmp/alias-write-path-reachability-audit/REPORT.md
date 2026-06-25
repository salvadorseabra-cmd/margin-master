# Alias Write Path Reachability Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Verdict:** **PASS** · **Confidence: 97%**

## Summary

`upsertConfirmedAlias` (and `releaseStaleAliasOwnership`) reachable in production **only** via `persistManualIngredientCorrection` on **5 human-initiated UI flows**. No automatic pipeline reaches DB alias writes.

---

## Live paths (5 UI entry points)

1. **Confirm Match** → `confirmIngredientMatch`
2. **Picker / reassign** → `selectIngredientForItem`
3. **Review & Create** → `saveCanonicalIngredientFromInvoice`
4. **Bulk create** → `saveBulkCanonicalIngredientsFromInvoice`
5. **Catalog review save** → `reassignCatalogReviewInvoiceLineMatch`

All set `manualConfirmation: true`.

---

## Dead / non-reachable

- `persistInvoiceLineAliasMemory` — **zero production callers**
- `autoPersistUnmatchedInvoiceItems` — in-memory only (`recordInvoiceLineAliasMemory`)
- Invoice re-read, Pass C, semantic matching — **no alias DB writes**

---

## Safety

Stale alias deletion **cannot** run without human confirmation action today.

---

## Model D

**No change** to write call paths expected — Model D is read/normalization layer only.

---

## Final answers

| # | Answer |
|---|--------|
| Production callers | 1 live direct; 5 UI entry points |
| Human initiated | 5 |
| Automatic | **No** |
| Re-read cleanup | **No** |
| Auto-match cleanup | **No** |
| Semantic cleanup | **No** |
| Safely isolated | **Yes** |
| Confidence | **97%** |

Model D Phase 1 is cleared from a reachability standpoint.
