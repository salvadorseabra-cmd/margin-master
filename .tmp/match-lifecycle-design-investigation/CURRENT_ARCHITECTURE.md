# Current Architecture — Match Lifecycle Model

**Mode:** READ-ONLY architecture analysis · **Generated:** 2026-06-14

---

## Summary

Match assignment today is **three decoupled writes** with **no binding lifecycle record**. The effective match is a **runtime projection**; cost side-effects are persisted **eagerly and independently** at extract time.

---

## Three Decoupled Writes

| Layer | Storage | Role | When written |
|-------|---------|------|--------------|
| **Line fact** | `invoice_items` | Text, qty, price | Extract (OCR) |
| **Confirmation memory** | `ingredient_aliases` | Wording → ingredient | Manual confirm/correct/create only |
| **Cost projection** | `ingredient_price_history` + `ingredients.current_price` | Operational cost | Extract sync for matched **and** suggested |

There is no `ingredient_id` or match status on `invoice_items` (`supabase/migrations/20260511115814_*.sql`).

---

## Effective Match (Runtime Projection)

Computed at read time by `resolveInvoiceTableRowIngredientMatch`:

| Input | Role |
|-------|------|
| `invoice_items.name` | Line text |
| `ingredient_aliases` | Confirmed wording memory |
| `ingredients` catalog | Matcher candidates |
| Matcher rules (`ingredient-canonical.ts`) | Resolution |
| `rejected-ingredient-matches` (localStorage) | Pair blocklist |

Documented as virtual resolution in `catalog-review-current-matches.ts`. **Not persisted.**

---

## Extract Sync Gate

`syncOperationalIngredientCostsFromInvoiceLines` (`ingredient-operational-intelligence.ts:933`):

- Skips only `unmatched` bucket
- **Both `suggested` and `confirmed` sync cost before review**
- Does **not** write aliases on auto `exact` match

**Pepino proof:** History row `a689bd91` written at extract 2026-06-09 with zero user action (`.tmp/pepino-contamination-timeline/REPORT.md`).

---

## Observed Lifecycle States (Runtime/UI Only)

| State | Trigger | Cost sync at extract | Alias written |
|-------|---------|---------------------|---------------|
| **Unmatched** | Matcher null | No | No |
| **Suggested** | `kind` ∈ {semantic, operational-equivalent} | **Yes** | No until Confirm |
| **Confirmed** | `kind` ∈ {exact, confirmed-alias, …} | **Yes** | Only if prior alias |

Suggested vs confirmed is **UI distinction only** (`ingredient-match-explanation.ts`).

---

## Manual Review Transitions

### Confirm suggested

```
confirmIngredientMatch → persistIngredientCorrectionForItem
  → upsertConfirmedAlias + persistOperationalIngredientCostFromInvoiceLine
```

Adds alias + optional history refresh. Removes nothing from prior wrong assignment.

### Correct to different ingredient

```
handleSelectCorrectionIngredient → rejectIngredientMatchPair (localStorage)
  → persistIngredientCorrectionForItem (new target)
```

| Layer | Old target | New target |
|-------|-----------|------------|
| `ingredient_price_history` | **Orphan row remains** | INSERT/UPDATE |
| `ingredients.current_price` | **Not reverted** | Updated |
| `reconcileIngredientPriceHistoryChain` | **Not invoked** | — |

Verdict code 2 — partial reversal (`.tmp/match-correction-reversal-audit/verdict.json`).

### Unmatch

- **No production UI or handler**
- `rejectIngredientMatchSuggestion` — zero route callers
- No history DELETE, no price revert
- Verdict code 3 for unmatch path (`.tmp/match-correction-reversal-audit/`)

---

## Rebuild Services (Exist, Unwired to Correction)

| Service | Triggered today | Not triggered by |
|---------|----------------|------------------|
| `reconcileIngredientPriceHistoryChain` | History UPDATE refresh, invoice delete | Match correction, unmatch |
| `reconcileAfterInvoiceDelete` | Invoice delete | — |
| `backfillIngredientPriceHistoryFromInvoices` | Manual backfill | Lifecycle events |

---

## Source-of-Truth vs Projection vs Cache

**Source of truth (partial, incoherent):**

- `invoice_items` — line facts
- `ingredient_aliases` — confirmed wording memory
- `ingredient_price_history` — cost audit trail per `(invoice_id, ingredient_id)`; no `invoice_item_id` FK
- `ingredients.current_price` — latest operational snapshot

**Projections (derived, should not be edited directly):**

- Virtual match resolution
- `buildMatchedInvoiceProductsFromScan` (supplier intel)
- `margin-alert-data`, operational intelligence synthesis
- `catalog-review-current-matches` counts
- `invoice_operational_metadata`

**Caches (rebuildable):**

- `matched_invoice_products_cache`
- `confirmedIngredientAliases` client map
- `rejected-ingredient-matches` localStorage
- In-memory override / operational alias tiers

---

## Downstream Consumers

```
invoice_items + aliases + matcher
  → purchase scan, catalog review, invoice UI

ingredient_price_history + ingredients
  → margin-alert-data → OI synthesis
  → ingredient-detail-panel, alerts route
  → ingredient-price-chain-guard (P0 read guard)
  → recipes.tsx (via dispatchOperationalIngredientCostChanged)
```

Correction changes live scan attribution (reject pair) but **not** history-backed reads until rows deleted/rechained.

---

## Architectural Gap (Foundations Verdict)

No persisted, per-`invoice_item` match lifecycle record atomically binding:

- which ingredient (if any) a line is matched to
- lifecycle status (suggested / confirmed / corrected / unmatched)
- timestamps and prior assignments

Without this, cost side-effects are written eagerly; correction/unmatch has no subtractive semantics.

Source: `.tmp/match-lifecycle-foundations-audit/FINAL_VERDICT.md`

---

## Prior Audit Cross-References

| Audit | Path |
|-------|------|
| Match lifecycle foundations | `.tmp/match-lifecycle-foundations-audit/` |
| Pepino contamination timeline | `.tmp/pepino-contamination-timeline/` |
| Match correction reversal | `.tmp/match-correction-reversal-audit/` |
| Remove match investigation | `.tmp/remove-match-investigation/` |
| Identity contamination | `.tmp/identity-contamination-audit/` |
| Match lifecycle architecture | `.tmp/match-lifecycle-architecture-audit/` |
