# Match Lifecycle Foundations — Final Verdict

**Mode:** READ-ONLY · **Generated:** 2026-06-14  
**Constraint:** Facts and evidence only. No fixes, designs, or recommendations.

---

## Question

What is the **smallest architectural gap** preventing a fully reversible Match Lifecycle?

---

## Verdict

**There is no persisted, per-`invoice_item` match lifecycle record** that atomically binds:

- which ingredient (if any) a line is matched to
- lifecycle status (suggested / confirmed / corrected / unmatched)
- timestamps and prior assignments

Without this binding record, cost side-effects (`ingredient_price_history`, `ingredients.current_price`) are written **eagerly and independently** of match state, and correction/unmatch has **no subtractive semantics** — even though reconcile/backfill services exist for other triggers.

---

## Evidence

### 1. No single source-of-truth for match assignment

Effective match is computed at read time, not stored:

| Input | Role |
|-------|------|
| `invoice_items.name` | Line text |
| `ingredient_aliases` | Confirmed wording → ingredient |
| `ingredients` catalog | Matcher candidates |
| Matcher rules | Resolution |
| `rejected-ingredient-matches` (localStorage) | Pair blocklist |

`invoice_items` schema has no `ingredient_id` or match status columns (`supabase/migrations/20260511115814_*.sql`). Documented in `catalog-review-current-matches.ts`.

### 2. Match assignment is three decoupled writes

| Write | Storage | When |
|-------|---------|------|
| Line fact | `invoice_items` | Extract |
| Confirmation memory | `ingredient_aliases` | Manual confirm/correct only |
| Cost projection | `ingredient_price_history` + `ingredients.current_price` | Extract sync for matched **and** suggested |

Extract sync gate (`ingredient-operational-intelligence.ts:933`) skips only `unmatched`; suggested and confirmed both persist cost before review.

### 3. Partial persisted match state exists, but is not lifecycle-coherent

| Artifact | Persisted? | Condition |
|----------|------------|-----------|
| Virtual match | No | Runtime only |
| `ingredient_aliases` | Yes | Manual confirm/correct/create |
| `ingredient_price_history` | Yes | Extract + manual correction (key: `invoice_id` + `ingredient_id`; no `invoice_item_id` FK) |
| `ingredients.current_price` | Yes | Same cost sync path |
| `rejected-ingredient-matches` | Yes (client) | `rejectIngredientMatchPair` on rematch to different id |
| `rejectedMatchItemIds` | Session only | `rejectIngredientMatchSuggestion` — zero production callers |

### 4. Correction is forward-only; unmatch is undefined

**Reassign (correction to different ingredient):**

- Adds: alias UPSERT to new target, history row on new target, `current_price` on new target, reject pair block
- Does not remove: old-target history row, old-target `current_price`, poisoned delta chains
- Does not invoke: `reconcileIngredientPriceHistoryChain`

**Unmatch:**

- No production UI or handler
- No history DELETE
- No `current_price` revert
- Contamination fully persists (match-correction-reversal-audit scenario B, verdict code 3)

**Pepino proof:**

1. Pre-review: `exact` match → history `a689bd91` + `current_price`; no alias (pepino-contamination-timeline)
2. Correction: rematch writes new-target state + reject pair; **`a689bd91` untouched** (match-correction-reversal-audit)
3. Unmatch: no handler; contamination persists

### 5. Rebuild services exist but are not wired to match lifecycle events

| Service | Exists | Invoked on correction/unmatch? |
|---------|--------|-------------------------------|
| `reconcileIngredientPriceHistoryChain` | Yes | **No** — only history UPDATE refresh + invoice delete |
| `reconcileAfterInvoiceDelete` | Yes | Invoice delete only |
| `backfillIngredientPriceHistoryFromInvoices` | Yes | Manual/idempotent backfill |
| `syncOperationalIngredientCostsFromInvoiceLines` | Yes | Extract + manual persist (additive only) |

`ingredient-correction-memory.ts` explicitly documents that `rejectIngredientMatchPair` does not mutate catalog, aliases cleanup, or history.

### 6. Suggested → Confirmed → Corrected → Unmatched → Reassigned lifecycle is not natively supported

- Suggested vs confirmed is **runtime/UI only** (`ingredient-match-explanation.ts`); both sync cost on extract
- No persisted `match_status`, `confirmed_at`, or `invoice_item_id` linkage
- Correction is **additive**, not lifecycle-aware
- Prior audit verdict: **Code 2 — PARTIAL** lifecycle model (`.tmp/match-lifecycle-architecture-audit/FINAL_VERDICT.md`)

A full lifecycle would require introducing a **new source-of-truth entity** — no existing table or client store binds line → ingredient → status → history atomically.

---

## Answers to Audit Questions (Condensed)

| # | Answer |
|---|--------|
| 1 | No single SoT; effective match is runtime projection |
| 2 | Partial: aliases (manual), history + current_price (extract/correct), reject pairs (client) |
| 3 | SoT: `invoice_items`, `ingredients`, `ingredient_aliases`, `ingredient_price_history` |
| 4 | Projections: virtual match, purchase scan, OI, margin alerts, catalog counts |
| 5 | Caches: client alias map, matched products cache, override/operational memory, rejected pairs |
| 6 | Not regenerable without DELETE: wrong history rows, poisoned deltas, old current_price without revert, audit trail |
| 7 | Regenerable: virtual match, missing history (backfill), caches, OI if inputs clean |
| 8 | History for one ingredient: partially reconstructible via backfill + reconcile; replays matcher |
| 9 | current_price: reconstructible from latest history or cost sync; no revert on old target |
| 10 | Rebuild/reconcile services exist; not wired to correction/unmatch |
| 11 | Unmatch: no handler; Reassign: forward-only orphans; Undo: no audit; Rebuild history: reconcile not invoked on correction |
| 12 | Lifecycle not natively supported; requires new SoT entity |

---

## Deliverable Index

| File | Contents |
|------|----------|
| `ARCHITECTURE_MAP.md` | Current architecture diagram and state transitions |
| `SOURCE_OF_TRUTH_MATRIX.json` | SoT / projection / cache / derived classification |
| `REBUILDABILITY_MATRIX.json` | Rebuildability per persisted artifact |
| `DEPENDENCY_GRAPH.json` | Upstream/downstream relationships |
| `FINAL_VERDICT.md` | This document |

---

## Prior Audit Cross-References

- `.tmp/pepino-contamination-timeline/REPORT.md`
- `.tmp/match-correction-reversal-audit/REPORT.md`
- `.tmp/match-lifecycle-architecture-audit/FINAL_VERDICT.md`
- `.tmp/remove-match-investigation/REPORT.md`
- `.tmp/identity-contamination-audit/REPORT.md`
