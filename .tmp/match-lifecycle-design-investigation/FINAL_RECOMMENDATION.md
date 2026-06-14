# Final Recommendation — Architectural Direction

**Mode:** READ-ONLY architecture analysis · **Generated:** 2026-06-14

**Constraint:** Architecture recommendation only. No implementation plan, no schema DDL, no code changes.

---

## Recommendation

**Pursue Match Lifecycle first (Option A), implementing Option 2 — Persisted Match Record + Gated Cost Projection — before Pack Variants P1.**

---

## Why Lifecycle First

### 1. Root gap is lifecycle coherence, not catalog shape alone

`.tmp/match-lifecycle-foundations-audit/FINAL_VERDICT.md`: no persisted per-line record; cost writes are eager and independent of match state. Pack variants split formats but do not bind line → assignment → cost atomically.

### 2. Contamination precedes review

Pepino: history `a689bd91` written at extract 2026-06-09 with zero user action (`.tmp/pepino-contamination-timeline/REPORT.md`). Extract sync runs for both suggested and confirmed (`ingredient-operational-intelligence.ts:933`).

### 3. Correction does not reverse

`.tmp/match-correction-reversal-audit/`: verdict code 2 — orphan history on old target, no `current_price` revert on `635a1189`, `reconcileIngredientPriceHistoryChain` not invoked on correction.

### 4. Unmatch is undefined

`.tmp/remove-match-investigation/`: no production Remove Match path; `rejectIngredientMatchSuggestion` has zero route callers. 46/51 VL lines are stably unmatched downstream — the gap is matched-line reversibility, not unmatched handling.

### 5. Rebuild services exist but are unwired

`reconcileIngredientPriceHistoryChain`, `backfillIngredientPriceHistoryFromInvoices`, `syncOperationalIngredientCostsFromInvoiceLines` — reusable once gated on lifecycle transitions (foundations audit).

### 6. Identity expansion increases risk without lifecycle

`.tmp/identity-expansion-simulation/REPORT.md`: better matching surfaces latent cross-format collapse — net trust decreases without workflow gate.

### 7. Pack variants remain required but second

`.tmp/identity-contamination-audit/`: 2/9 VL ingredients contaminated; structural architecture risk. P1 closes catalog collapse **after** workflow prevents eager poison. Pepino recommendation rank: lifecycle (1) → matcher guards (2) → pack variants (3).

---

## Target Architecture (Conceptual)

### Source of truth

**Primary:** `invoice_item_matches` — one record per `invoice_item_id` binding:

- `ingredient_id` (nullable)
- `status`: suggested | confirmed | unmatched
- `match_kind`, timestamps, optional `previous_ingredient_id`
- `pack_variant_id` (nullable until P1 — additive, not a lifecycle rewrite)

**Secondary SoT (unchanged role):**

- `invoice_items` — line text/qty/price facts
- `ingredients` — catalog identity (concept layer)
- `ingredient_aliases` — wording memory derived from confirmed matches

### Projections (never edit directly)

- Virtual match UI display
- `buildMatchedInvoiceProductsFromScan` / supplier intel
- `margin-alert-data`, operational intelligence synthesis
- `catalog-review-current-matches` counts
- Client caches and mirrors
- `ingredients.current_price` — **should become** derived from latest trusted history row per ingredient/variant

### Lifecycle semantics

| Transition | Match record | Cost side-effects |
|------------|--------------|-------------------|
| **Suggested** | Matcher writes `status=suggested` | **None** |
| **Confirmed** | User confirm or policy → `status=confirmed` | History append + current_price update |
| **Corrected / Reassigned** | Update record; store previous assignment | Delete old-target history row; reconcile old + new chains; update both current_prices |
| **Unmatched** | `ingredient_id=null`, `status=unmatched` | Delete history row; revert current_price via reconcile |

### Marginly principles preserved

| Principle | How |
|-----------|-----|
| Simple UX | Confirm / Correct / Remove Match map 1:1 to lifecycle transitions |
| No ERP complexity | One match table + gated projection — not full event store |
| Human review when needed | Suggested (and high-risk exact) do not sync cost until confirm |
| Reliable historical pricing | History keyed through match record; orphan cleanup on reversal |
| Reliable operational intelligence | OI reads confirmed-cost inputs; guard becomes safety net |

---

## What NOT to Do First

- **Do not** ship Pack Variants P1 alone — `pack_variants_without_workflow_fix.safe: false`
- **Do not** rely on P0 read guard as the fix — bandage only (`.tmp/identity-contamination-audit/`)
- **Do not** implement Option 4 (virtual + server reject log only) — Pepino had no alias; exact bypasses confirm
- **Do not** treat Option 1 (gate only) as sufficient — reassignment still orphans without subtractive semantics

---

## Sequencing After Lifecycle

| Phase | Workstream | Purpose |
|-------|------------|---------|
| **Now** | Match lifecycle (Option 2) | Reversibility + stop pre-review poison |
| **Next** | Matcher guards (preservation class, token-subset) | Reduce wrong suggestions |
| **Then** | Pack Variants P1 | Add `pack_variant_id` to match record + variant-scoped history |
| **Later** | Supplier product layer (P2) | Alias hardening, contract snapshot |
| **Gate** | OI production enablement | After VL re-read green post-remediation |

---

## Answers to Twelve Design Questions (Summary)

| # | Answer |
|---|--------|
| 1 | Smallest change: persisted per-line match record + gated cost sync + subtractive correction/unmatch |
| 2 | SoT: `invoice_item_matches`; demote virtual match and eventually current_price/history to projections |
| 3 | Unchanged: `invoice_items`, `ingredients` catalog, recipes, downstream read consumers, matcher logic |
| 4 | Projections never edited directly: OI, purchase scan, catalog counts, caches, virtual match UI |
| 5 | History can become fully derived (eventually) — gated on confirmed match records |
| 6 | current_price can become fully derived — from latest trusted history via reconcile |
| 7 | Reuse: reconcile, backfill, sync (gated), append history, matcher, correction memory, cost-changed event |
| 8 | Redundant: extract sync for unconfirmed; virtual match as SoT; client reject as primary authority |
| 9 | Migration risks: existing poison, 11 synced VL lines, orphan cleanup, localStorage reject promotion |
| 10 | P1 adds `pack_variant_id` to match record; same lifecycle semantics at variant scope |
| 11 | Lifecycle first **strongly simplifies** pack variants |
| 12 | Pack variants first **does not simplify** lifecycle |

---

## Confidence

**91%** — consistent across pepino timeline, correction-reversal, foundations, remove-match, and identity contamination audits.

Prior partial lifecycle verdict (code 2): `.tmp/match-lifecycle-architecture-audit/FINAL_VERDICT.md`.

---

## Deliverable Index

| File | Contents |
|------|----------|
| `CURRENT_ARCHITECTURE.md` | Current three-write model summary |
| `TARGET_LIFECYCLE_OPTIONS.md` | Four options compared |
| `PACK_VARIANT_INTERACTION.md` | Lifecycle × identity ordering |
| `DECISION_MATRIX.md` | A vs B vs C tradeoffs |
| `FINAL_RECOMMENDATION.md` | This document |
