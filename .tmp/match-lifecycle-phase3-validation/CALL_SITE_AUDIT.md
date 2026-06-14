# Phase 3 — Dual-Write Call Site Audit

## MLS entry points (`match-lifecycle-service.ts`)

| Function | Called from | Trigger |
|----------|-------------|---------|
| `confirmMatch` | `dualWriteMatchLifecycleAfterIngredientPersist` | Confirm, manual pick, canonical create |
| `correctMatch` | same helper | Correction while still suggested |
| `reassignMatch` | same helper | Correction while confirmed |
| `markSuggested` | — | Not wired (future / shadow alignment) |
| `markUnmatched` | — | Not wired (Phase 5 Remove Match UI) |

## `invoices.tsx` call sites

| Location | Handler | MLS transition | When |
|----------|---------|----------------|------|
| ~1995 | `confirmIngredientMatch` | `confirmMatch` | After `persistIngredientCorrectionForItem` ok |
| ~2045 | `selectIngredientForItem` | `confirmMatch` or `correctMatch`/`reassignMatch` | After persist ok; branch on `lifecycle` options |
| ~2120 | `saveCanonicalIngredientFromInvoice` | `confirmMatch` (`manual`) | After `saveCanonicalIngredientFromInvoiceRow` ok |
| ~2205 | `saveBulkCanonicalIngredientsFromInvoice` | `confirmMatch` per row | After each bulk outcome ok |
| ~3070 | `handleSelectCorrectionIngredient` | via `selectIngredientForItem` + lifecycle | Passes `previousIngredientId`, `wasConfirmed` |

## Helper

`dualWriteMatchLifecycleAfterIngredientPersist` (~line 182):

- Flag-gated inside MLS functions
- Fire-and-forget (`void`) — non-blocking
- Does not replace `persistIngredientCorrectionForItem`

## Intentionally NOT wired

| Path | Reason |
|------|--------|
| Extract / re-extract | Phase 2 shadow seed handles extract seed; MLS extract transition deferred |
| `syncOperationalIngredientCostsFromInvoiceLines` | No pricing in MLS Phase 3 |
| Remove Match / reject-only flows | Phase 5 |
| Read paths (`resolveInvoiceTableRowIngredientMatch`) | Phase 4 |
| `markSuggested` at extract | Shadow seed covers Phase 2 |

## Legacy paths unchanged

- `persistIngredientCorrectionForItem` — alias queue, cost sync, localStorage
- `rejectIngredientMatchPair` — client reject memory
- `dispatchOperationalIngredientCostChanged` — event dispatch
- Review UI, matcher display, KPI badges — virtual resolution only
