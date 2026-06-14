# Phase 4 Read Cutover — Cutover Impact

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## `resolveInvoiceTableRowIngredientMatch` Consumers

| File | Role | Immediate behavior change if persisted preferred |
|------|------|---------------------------------------------------|
| `src/routes/invoices.tsx:3142,3354` | ItemsTable render + header summary | Pepino-class lines: **Confirmed chip → Suggested + Confirm**; summary `matchedIngredients↓`, `possibleIngredientMatches↑` |
| `src/routes/invoices.tsx:3529` | Correction `wasConfirmed` snapshot | Branching `reassignMatch` vs `correctMatch` driven by new displayState |
| `src/lib/invoice-unresolved-ingredient-count.ts:83` | Invoice list badges | More **orange** “review ingredient matches”; `isNormalizationComplete` false when suggested > 0 |
| `src/lib/bulk-canonical-ingredient-create.ts:117` | Bulk-create eligibility | **Unchanged** — only `unmatched` rows qualify |
| `src/lib/catalog-review-current-matches.ts:108` | Per-ingredient match counts | Rows still counted if suggested; **`matchDisplayState` changes** on listed rows |
| `src/lib/ingredient-operational-intelligence.ts:659,770,847,958` | Purchase scan, latest purchase, cost overlay, extract sync | `matchDisplayState` / bucket shift; suggested lines **still included** in scan |
| `src/lib/ingredient-price-history-backfill.ts:157` | Admin backfill matcher | Fewer lines treated as fully “matched” if suggested excluded from confirmed semantics |
| `src/lib/invoice-item-match-shadow-seed.ts:68` | Shadow seed builder | **Circular dependency risk** if seed calls cutover-aware resolver |
| Tests only | `invoice-ingredient-row-display.test.ts`, `catalog-review-current-matches.test.ts` | Need dual-read fixtures |

---

## UI Behaviors That Change Immediately (with populated persisted data)

1. Pepino / bare-`exact` / `operational-memory` lines show **Suggested**, not Matched.
2. ItemsTable header KPI buckets shift (matched ↓, suggested ↑).
3. Invoice list moves from green **Processed** to orange **review ingredient matches** where suggested remain.
4. Confirm buttons appear on lines previously auto-confirmed by matcher.
5. Correction flow `wasConfirmed` false more often → `correctMatch` keeps `suggested` vs `reassignMatch`.
6. Catalog review / OI purchase memory rows show `matchDisplayState: suggested` (still listed, different badge).
7. `vl-cleanup-investigation.mts` attribution changes (uses same resolver).
8. Lines **without** persisted rows (flags OFF, no backfill, post-re-extract without seed) — behavior depends on unimplemented fallback.

---

## Behaviors That Do NOT Change at Read Cutover Alone

- Extract cost gate (Phase 1) — still uses resolver but gate logic separate.
- Price history rows — no subtractive cleanup until Phase 5/6.
- Remove Match — still absent.
- Alias memory writes — unchanged.
