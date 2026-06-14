# Match Lifecycle V1 — Service Impact Analysis

**Mode:** READ-ONLY implementation planning · **Generated:** 2026-06-14  
**Answers:** Questions 5 (reusable) and 6 (refactoring required)

---

## Impact Classification Legend

| Class | Meaning |
|-------|---------|
| **REUSE** | No modification; wire to new caller only |
| **MINOR** | Gate, filter, or read-order change (< ~50 LOC) |
| **MAJOR** | New module or substantial behavior change |
| **REPLACE** | Current path retired; logic moves to MLS |

---

## New Service (MAJOR — create)

### `match-lifecycle-service.ts` (conceptual)

| Responsibility | Transitions |
|----------------|-------------|
| Validate transition | All T1–T8 |
| Upsert `invoice_item_matches` | Extract, confirm, correct, unmatch |
| Orchestrate pricing side-effects | Confirmed only |
| Subtractive cleanup | T5, T7 |
| Invalidate caches / dispatch events | All cost-affecting |

**Evidence:** Design requires single write authority (`.tmp/match-lifecycle-v1-design/LIFECYCLE_TRANSITIONS.md` §Transition Service); today scattered in `invoices.tsx`.

---

## REUSE — No Modification Required

| Service | File | V1 role | Evidence |
|---------|------|---------|----------|
| `reconcileIngredientPriceHistoryChain` | `ingredient-price-history-reconcile.ts:124` | Invoke after append/delete on transitions | Exists; unwired to correction (`.tmp/match-lifecycle-foundations-audit/FINAL_VERDICT.md` §5) |
| `reconcileAfterInvoiceDelete` | `ingredient-price-history-reconcile.ts:220` | Unchanged — invoice delete path | Already wired |
| `appendIngredientPriceHistoryFromInvoiceLine` | `ingredient-price-history.ts:458` | Called from MLS on confirm/correct/auto-confirm | Refresh + reconcile on re-extract already internal |
| `persistOperationalIngredientCostFromInvoiceLine` | `ingredient-auto-persist.ts` | Called from MLS after append | Unchanged signature |
| `dispatchOperationalIngredientCostChanged` | `resolve-operational-ingredient-cost.ts` | MLS fires for old + new ids on correction | Today new id only (`verdict.json` Q6) |
| `ingredient-price-chain-guard` | `ingredient-price-chain-guard.ts` | P0 read safety net until data clean | `.tmp/identity-contamination-audit/REPORT.md` |
| `resolveIngredientPriceHistoryCreatedAt` | `ingredient-price-history.ts` | Unchanged | Invoice-date anchoring (Pepino timeline) |
| `operationalCostFieldsFromInvoiceLine` | `ingredient-auto-persist.ts` | Unchanged — line fact → operational fields | |
| `ingredient-canonical.ts` matcher | `ingredient-canonical.ts` | Proposes assignment at extract | Output feeds MLS, not direct cost sync |
| `buildInvoiceMatchCatalog` | `ingredient-canonical.ts` | Unchanged | |
| `upsertConfirmedAlias` | `ingredient-alias-memory.ts` | Called from MLS on confirm/correct | |
| `fetchLatestHistoryNewPrice` | `ingredient-price-history.ts` | Used by reconcile for current_price revert | |

---

## MINOR — Gate, Filter, or Read-Order Change

| Service | File | Change | Phase |
|---------|------|--------|:-----:|
| `syncOperationalIngredientCostsFromInvoiceLines` | `ingredient-operational-intelligence.ts:903` | Add `confirmed`-only gate at line 933; eventually delegate to MLS | 1, 3 |
| `backfillIngredientPriceHistoryFromInvoices` | `ingredient-price-history-backfill.ts:155` | Filter lines where match record `status=confirmed` | 7 |
| `rejectIngredientMatchPair` | `ingredient-correction-memory.ts:371` | Add optional server persist; MLS invokes | 5, 7 |
| `rejectIngredientMatchSuggestion` | `ingredient-correction-memory.ts:350` | Wire to MLS unmatch from UI | 5 |
| `resolveIngredientCorrectionUiState` | `ingredient-correction-memory.ts:412` | Add Remove Match affordance branch | 5 |
| `invoiceRowMatchSummaryBucket` | `invoice-ingredient-row-display.ts` | Map from persisted `status` when flag on | 4 |
| `clearIngredientMatchedInvoiceProductsCache` | `ingredient-operational-intelligence.ts` | MLS invalidates on transitions | 3 |
| `loadInvoiceItemsForMatchedProductScan` | `ingredient-operational-intelligence.ts:977` | Optional join to match records | 4 |

---

## MAJOR — Substantial Refactoring

| Service | File | Change | Risk |
|---------|------|--------|:----:|
| `resolveInvoiceTableRowIngredientMatch` | `invoice-ingredient-row-display.ts:11` | Read `invoice_item_matches` first; demote virtual resolution | **High** |
| `persistIngredientCorrectionForItem` | `invoices.tsx:1702` | Replace with MLS `transitionConfirm` / `transitionCorrect` | **High** |
| `confirmIngredientMatch` | `invoices.tsx:1882` | Delegate to MLS | Medium |
| `handleSelectCorrectionIngredient` | `invoices.tsx:2944` | Delegate to MLS T7 | **High** |
| Extract persistence block | `invoices.tsx:1338–1384` | Insert match records; remove/gate direct cost sync | **High** |
| `buildMatchedInvoiceProductsFromScan` | `ingredient-operational-intelligence.ts` | Prefer match record status over runtime `displayState` | Medium |
| `buildCatalogReviewCurrentMatches` | `catalog-review-current-matches.ts` | Source status from match records | Medium |
| `buildLatestConfirmedPurchaseAtByIngredientIdFromScan` | `ingredient-operational-intelligence.ts:960` | Filter `status=confirmed` from records | Medium |
| `bulk-canonical-ingredient-create.ts` | `bulk-canonical-ingredient-create.ts:281` | MLS transition on bulk link | Medium |
| `ingredient-price-history-backfill.ts` | Full file | Join match records; skip non-confirmed | Medium |

---

## REPLACE — Retire or Demote Primary Role

| Current path | Replacement | Notes |
|--------------|-------------|-------|
| Extract-time `syncOperationalIngredientCostsFromInvoiceLines` | MLS extract transition (no cost write for suggested) | Pepino root cause |
| Virtual match as implicit SoT | `invoice_item_matches` + projection layer | Foundations verdict |
| `ingredient_match_override` session override | Match record updates | Demoted priority |
| Client-only `rejected-ingredient-matches` as primary | Server `ingredient_match_rejections` + tombstone | Phase 7 |
| `confirmedIngredientAliases` as match authority | Aliases as derived from confirmed matches | Read path change |

**Not replaced:** `ingredient_aliases` table — remains wording memory, write-gated by confirm.

---

## Consumer Impact (read-only consumers — MINOR unless noted)

| Consumer | File | Impact |
|----------|------|--------|
| `margin-alert-data.ts` | `margin-alert-data.ts` | Cleaner inputs post-remediation; no code change V1 |
| `operational-intelligence-synthesis.ts` | `operational-intelligence-synthesis.ts` | Benefits from clean history; enable after Phase 8 |
| `operational-intelligence-view.ts` | `operational-intelligence-view.ts` | Same |
| `ingredient-detail-panel.ts` | `ingredient-detail-panel.ts` | Guard still needed until P1 variants |
| `recipes.tsx` | `recipes.tsx` | cost-changed both ids — verify invalidation |
| `alerts.tsx` | `alerts.tsx` | Unchanged |
| `ingredients.review.tsx` | `ingredients.review.tsx` | Catalog review reads match records |
| `invoice-operational-metadata.ts` | `invoice-operational-metadata.ts` | May join match status |
| `ingredient-orphan-diagnostics.ts` | `ingredient-orphan-diagnostics.ts` | New diagnostics: suggested with history = violation |

---

## Dependency Graph Delta

From `.tmp/match-lifecycle-foundations-audit/DEPENDENCY_GRAPH.json`:

**New nodes:** `invoice_item_matches`, `match_lifecycle_service`, `ingredient_match_rejections`

**New edges:**
- `ocr_extract` → `match_lifecycle_service` (replaces direct sync edge)
- `match_lifecycle_service` → `invoice_item_matches` (writes)
- `match_lifecycle_service` → `appendIngredientPriceHistoryFromInvoiceLine` (confirmed only)
- `match_lifecycle_service` → `reconcileIngredientPriceHistoryChain` (all subtractive)
- `invoice_item_matches` → `resolveInvoiceTableRowIngredientMatch` (reads first)
- `manual_review_ui` → `match_lifecycle_service` (all transitions)

**Broken edges:**
- `resolveInvoiceTableRowIngredientMatch` → `syncOperationalIngredientCostsFromInvoiceLines` at extract (gated)

---

## Test Files Requiring Updates

| Test file | Reason |
|-----------|--------|
| `ingredient-operational-intelligence.test.ts` | Extract gate behavior |
| `ingredient-price-history-persistence.test.ts` | Confirm-first write |
| `ingredient-price-history-reconcile.test.ts` | Correction invokes reconcile |
| `ingredient-correction-memory.test.ts` | Remove match wiring |
| `invoice-ingredient-row-display.test.ts` | Read from match record |
| `catalog-review-current-matches.test.ts` | Status from SoT |

---

## Evidence Index

| Service fact | Source |
|--------------|--------|
| Sync skips only unmatched | `src/lib/ingredient-operational-intelligence.ts:933` |
| Reconcile not on correction | `.tmp/match-correction-reversal-audit/verdict.json` Q8 |
| rejectIngredientMatchSuggestion unwired | `.tmp/remove-match-investigation/REPORT.md` |
| Backfill replays matcher | `src/lib/ingredient-price-history-backfill.ts:157` |
| Dependency graph | `.tmp/match-lifecycle-foundations-audit/DEPENDENCY_GRAPH.json` |
