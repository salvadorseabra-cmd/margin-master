# Flow Comparison — "Matched to" vs "Correct match"

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Classification

**A — Same flow, two entry points** (with one metadata divergence on how the picker is opened)

---

## Operation Comparison

| Operation | Matched to chip | Correct match link | Same? |
|-----------|-----------------|-------------------|-------|
| **Open picker** | Yes; `wasConfirmed` set for confirmed | Yes; `wasConfirmed` **omitted** | Partial — snapshot differs |
| **Confirm suggested** | N/A | N/A | Third path: `Confirm match` → `confirmIngredientMatch` (2047-2093), bypasses picker |
| **Reassign (A→B)** | `selectIngredientForItem` + `reassignMatch` if confirmed | Same handlers, but `correctMatch(keepConfirmed:false)` if opened via link | **Handlers same; MLS/pricing behavior can differ** |
| **Remove match** | `handleRemoveCorrectionMatch` → `unmatchInvoiceLineMatch` | Same | Same handlers; snapshot `wasConfirmed` may affect subtractive pricing |
| **Create ingredient** | Picker action or standalone button | Same | Yes |

---

## Shared Write Stack (All Select Paths)

```
persistIngredientCorrectionForItem (1867)
  → persistManualIngredientCorrection (1914) → upsertConfirmedAlias (ingredient_aliases)
  → persistOperationalIngredientCostFromInvoiceLine (1947)
  → dualWriteMatchLifecycleAfterIngredientPersist (198) [gated: VITE_MATCH_LIFECYCLE_DUAL_WRITE]
  → reject/clear correction memory (3266, 2020-2028)
```

---

## Confirm-Only Path (Neither Control)

```
confirmIngredientMatch (2047) → persistIngredientCorrectionForItem → dualWrite confirmMatch
```

One-click for **suggested** rows only; no picker, no subtractive cleanup.

---

## Pricing Cleanup

| Action | Subtractive on A | Via |
|--------|------------------|-----|
| Remove match | Yes | `unmatchInvoiceLineMatch` → `subtractivePricingCleanupForUnmatch` |
| Reassign A→B | Yes (if flags ON + `wasConfirmed`) | `subtractivePricingCleanupForReassign` in `selectIngredientForItem` |
| Confirm suggested | No subtractive (first assign) | Forward writes only |

**Link path risk:** Opening via "Correct match" on a confirmed row may skip `reassignMatch` + Phase 5B subtractive cleanup.
