# Match Lifecycle Map — Actual Behavior

**Mode:** READ-ONLY architecture audit · **Generated:** 2026-06-14  
**Reference case:** Pepino fresco (Bidfood) → Pepino conserva → correction or unmatch

There is **no persisted match lifecycle state machine**. Effective lifecycle is split across virtual matcher output, optional alias rows, cost side-effects, and client-only rejection memory.

---

## State: Unmatched

| Aspect | Behavior |
|--------|----------|
| **Trigger** | Matcher returns null; or `displayState: unmatched` |
| **Persisted** | `invoice_items` only (line text, qty, price) |
| **Not persisted** | ingredient_id, match kind, confidence |
| **Extract sync** | **Skipped** — `syncOperationalIngredientCostsFromInvoiceLines` continues only if bucket ≠ unmatched |
| **UI** | Picker open; "Create new ingredient" visible |
| **Code** | `invoice-ingredient-row-display.ts` `invoiceRowMatchSummaryBucket` |

---

## State: Suggested

| Aspect | Behavior |
|--------|----------|
| **Trigger** | `match.kind` ∈ {`semantic`, `operational-equivalent`} |
| **Persisted at extract** | **Yes** — `ingredient_price_history` + `ingredients.current_price` (same as confirmed) |
| **Alias** | **Not** written until user confirms |
| **UI** | "Confirm match" + "Correct match" |
| **Confirm path** | `confirmIngredientMatch` → `persistIngredientCorrectionForItem` → alias UPSERT + cost sync |
| **Distinction from confirmed** | UI only + match kind; **extract sync treats both as matched bucket** |

**Evidence:** `ingredient-match-explanation.ts` `isSuggestedIngredientMatch`; `ingredient-operational-intelligence.ts:933` skips only `unmatched`.

---

## State: Confirmed (auto or alias)

| Aspect | Behavior |
|--------|----------|
| **Trigger** | `match.kind` ∈ {`exact`, `confirmed-alias`, `operational-memory`, `operational-alias`, `confirmed-override`} |
| **Persisted at extract** | **Yes** — history + current_price (no alias unless `confirmed-alias` from prior user action) |
| **Pepino case** | `exact` → confirmed; alias miss; history `a689bd91` written pre-review |
| **UI** | "Matched to: X" chip; "Correct match" only (no Confirm, no Create) |
| **Code** | `resolveIngredientCorrectionUiState` confirmed branch |

---

## Transition: Suggested → Confirmed (user Confirm)

```
confirmIngredientMatch (invoices.tsx ~1882)
  → persistIngredientCorrectionForItem
      → persistManualIngredientCorrection → upsertConfirmedAlias
      → persistOperationalIngredientCostFromInvoiceLine
      → dispatchOperationalIngredientCostChanged
```

**Adds:** `ingredient_aliases`, override memory, optional history refresh  
**Removes:** nothing from prior wrong assignment (N/A on first confirm)

---

## Transition: Confirmed/Suggested → Corrected (different ingredient)

```
handleSelectCorrectionIngredient (invoices.tsx ~2944)
  → rejectIngredientMatchPair (old ingredient) — localStorage only
  → selectIngredientForItem
  → persistIngredientCorrectionForItem (new ingredient)
```

| Layer | Old target (635a1189) | New target |
|-------|----------------------|------------|
| Virtual match | Blocked via reject pair | Alias UPSERT |
| ingredient_aliases | Unchanged (no Pepino alias existed) | Pepino → new id |
| ingredient_price_history | **Orphan row remains** | New row INSERT/UPDATE |
| ingredients.current_price | **Not reverted** | Updated |
| Cache / events | Old id not invalidated | `clearIngredientMatchedInvoiceProductsCache(new)` + cost event |

**Verdict:** Forward reassignment only — not a lifecycle "move."

---

## Transition: Any → Unmatched (No Match)

| Aspect | Behavior |
|--------|----------|
| **UI** | **Not supported** — no picker sentinel, no handler |
| **Code exists unwired** | `rejectIngredientMatchSuggestion` (session); never called from routes |
| **rejectIngredientMatchPair** | Only when rematching to **different** id |
| **If it existed** | Would need: reject pair + history delete + price revert — **none implemented** |

---

## Transition: Reassigned + history rebuild

| Trigger | Service | Effect |
|---------|---------|--------|
| Re-extract same invoice + same ingredient | `appendIngredientPriceHistoryFromInvoiceLine` refresh | UPDATE row + `reconcileIngredientPriceHistoryChain` |
| Delete entire invoice | `reconcileAfterInvoiceDelete` | Rechain affected ingredients; delete orphan rows |
| Match correction | — | **No reconcile invoke** |
| Unmatch | — | **No handler** |

---

## Downstream read lifecycle (derived)

```
invoice_items + aliases + matcher
  → buildMatchedInvoiceProductsFromScan (purchase / supplier intel)
  → catalog-review-current-matches (counts)

ingredient_price_history + ingredients
  → margin-alert-data.ts
  → operational-intelligence-synthesis.ts
  → ingredient-detail-panel (trend)
  → ingredient-price-chain-guard (P0 read guard)
```

Correction changes **live scan** attribution (with reject pair) but not **history-backed** reads until rows deleted/rechained.

---

## Pepino artifact map (observed)

| Artifact | After auto-match | After correction to new id | After unmatch (hypothetical) |
|----------|------------------|---------------------------|------------------------------|
| invoice_items | Pepino line | unchanged | unchanged |
| virtual match | → conserva | → new id (if reject pair) | null (if reject pair) |
| ingredient_aliases (Pepino) | none | UPSERT → new | none |
| history a689bd91 | exists on conserva | **still exists** | would need delete |
| ingredients 635a1189 price | poisoned/overwritten | **not reverted** | would need revert |

---

## Architecture gap summary

The system implements **Match Assignment** (virtual + cost write) and **Match Confirmation** (alias write) but not:

- Persisted lifecycle status per invoice line
- Unmatch / tombstone
- Subtractive correction (delete/move history)
- Automatic chain repair on correction
- Suggested-vs-confirmed **persist gate** (both sync on extract)
