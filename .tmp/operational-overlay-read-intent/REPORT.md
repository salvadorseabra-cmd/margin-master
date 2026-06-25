# Operational Overlay Read Path — Architectural Intent Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Mode:** Read-only intent audit (not bug hunt)

## Executive Summary

Operational Overlay still invokes the virtual matcher because **`invoice_items` has no `ingredient_id` column** and the overlay was architected (May 2026) to derive `ingredient_id` at read time using the same ItemsTable matcher as Invoice Review — **before** `invoice_item_matches` existed.

Match Lifecycle (June 2026) introduced persisted per-line matches and a **hybrid read cutover** layer: virtual is always computed; persisted wins when `VITE_MATCH_LIFECYCLE_READ_CUTOVER` is on and a row exists. This is **intentional transitional architecture (Decision C)**, not an accidental leftover.

**Current codebase state (working tree):** Loader wiring for `persistedMatchByItemId` is present in `ingredient-operational-intelligence.ts` and `ingredient-pricing-freshness.ts` but was **not** in `HEAD` at audit time — completing work partially started in commit `5b4a171` (build functions wired; loaders were not).

---

## Phase 1 — Every Virtual Matcher Call

All four audited paths share the same resolution primitive:

```
resolveInvoiceTableRowIngredientMatch(...)
  → resolveInvoiceRowIngredientMatch (virtual)
  → resolveReadCutoverMatch (persisted override when flag + map + row)
```

Virtual is **always executed**; cutover may replace the outcome.

### 1. `loadOperationalIngredientCostOverlay`

| Aspect | Detail |
|--------|--------|
| **Why exists** | Recipe operational costing: `Map<ingredientId, OperationalInvoiceCostEntry>` for `resolveOperationalIngredientCostFields` / recipe margin |
| **Data needed** | Per invoice line: `ingredient_id`, match bucket (exclude unmatched), line price/qty/unit, invoice chronology, supplier |
| **Virtual call site** | Delegates to `buildLatestOperationalIngredientCostByIngredientIdFromScan` |
| **Persisted alternative** | When cutover ON: `loadPersistedMatchByItemIdForScan` → `buildCutoverContextForInvoiceItem` per row; persisted `ingredient_id` + `status` drive assignment |
| **If persisted-only** | Could skip virtual when persisted hit, but would lose drift diagnostics, fallback for missing rows, and full canonical match metadata; catalog synthesis (`buildInvoiceMatchCatalog`) still required |

### 2. `buildLatestOperationalIngredientCostByIngredientIdFromScan`

| Aspect | Detail |
|--------|--------|
| **Why exists** | Pure scan reducer — newest matched line per catalog ingredient wins |
| **Data needed** | Same as overlay loader; filters `bucket !== "unmatched"` |
| **Virtual call** | Per eligible row: `resolveInvoiceTableRowIngredientMatch` with optional cutover context |
| **Persisted param** | `persistedMatchByItemId?: ReadonlyMap<string, PersistedMatchForCutover>` — added `5b4a171` |
| **If persisted-only** | Assignment could come from map alone; cost field mapping (`operationalCostFieldsFromInvoiceLine`) is independent of matcher |

### 3. `loadLatestPurchaseGlanceByIngredientId` (`ingredient-pricing-freshness.ts`)

| Aspect | Detail |
|--------|--------|
| **Why exists** | Ingredients list + recipes page: last purchase date, supplier label, last paid total per ingredient |
| **Data needed** | `ingredient_id`, chronology, supplier, line total |
| **Virtual call site** | `buildLatestPurchaseGlanceByIngredientIdFromScan` — same per-row pattern |
| **Persisted wiring** | `loadPersistedMatchByItemIdForScan` → scan builder (present in working tree; absent in `HEAD`) |
| **If persisted-only** | Same hybrid tradeoffs as cost overlay |

### 4. `loadIngredientMatchedInvoiceProducts`

| Aspect | Detail |
|--------|--------|
| **Why exists** | Ingredient detail purchase history + purchase memory section — full match presentation |
| **Data needed** | All of above plus `matchKind`, confidence label, explanation headline/detail, stock presentation, purchase structure |
| **Virtual call site** | `buildMatchedInvoiceProductsFromScan` per row |
| **Persisted wiring** | Passes `persistedMatchByItemId` in options (working tree); build param existed since `5b4a171` |
| **If persisted-only** | Persisted record has `ingredient_id`, `status`, `match_kind` — explanation text still derived from virtual match object via `buildMatchExplanation(match, ...)` after cutover resolution |

---

## Phase 2 — Historical Intent

### Timeline

| Date | Event | Implication |
|------|-------|-------------|
| 2026-05-22 | `da8ff44` — operational workspace UX | Operational overlay born; no `invoice_item_matches` |
| 2026-05-27 | `41d8c4a` — align OI aggregation with recipe costing | `buildLatestOperationalIngredientCostByIngredientIdFromScan` + virtual scan pattern established |
| 2026-06-14 | `8a054eb` — `invoice_item_matches` schema | Persisted match container; migration comment: *"no app wiring until later phases"* |
| 2026-06-14 | `5b4a171` — read cutover infrastructure | `resolveReadCutoverMatch`, build-level `persistedMatchByItemId` params; Invoice Review + catalog review wired; **overlay loaders not wired in commit** |
| 2026-06-25 | Working tree | `loadPersistedMatchByItemIdForScan` + loader wiring added (uncommitted) |

### Why virtual was written

`catalog-review-current-matches.ts` documents the original intent:

> *Schema: invoice_items has no ingredient_id — match is resolved at read time using confirmed alias memory + catalog (same as purchase memory / ingredients detail).*

Operational overlay was designed as a **read-time aggregation** over `invoice_items`, sharing the Invoice Review matcher so recipe costing and ingredient detail showed the same matches users saw during review. This predates Match Lifecycle by ~3 weeks.

### Did `invoice_item_matches` exist when overlay was written?

**No.** Table created 2026-06-14. Overlay virtual scan predates it by design.

---

## Phase 3 — Existing Support

### `persistedMatchByItemId` params

| Layer | Status |
|-------|--------|
| `buildMatchedInvoiceProductsFromScan` | Param since `5b4a171` ✓ |
| `buildLatestPurchaseGlanceByIngredientIdFromScan` | Param since `5b4a171` ✓ |
| `buildLatestOperationalIngredientCostByIngredientIdFromScan` | Param since `5b4a171` ✓ |
| `buildLatestConfirmedPurchaseAtByIngredientIdFromScan` | Param in working tree ✓ |
| `loadPersistedMatchByItemIdForScan` | **New in working tree** (shared helper) |
| `loadOperationalIngredientCostOverlay` | **Wired in working tree**; not in `HEAD` |
| `loadLatestPurchaseGlanceByIngredientId` | **Wired in working tree**; not in `HEAD` |
| `loadIngredientMatchedInvoiceProducts` | **Wired in working tree**; not in `HEAD` |

### Already-wired consumers (since `5b4a171`)

- `invoices.tsx` — ItemsTable row render + unresolved counts
- `catalog-review-current-matches.ts` — `loadCatalogReviewInvoiceItemScan`
- `invoice-unresolved-ingredient-count.ts`

### Unwired / partial paths

| Path | Gap |
|------|-----|
| `ingredient-orphan-diagnostics.ts` | Calls `buildMatchedInvoiceProductsFromScan` without `persistedMatchByItemId` |
| `syncOperationalIngredientCostsFromInvoiceLines` | Write path on invoice ingest — virtual only (no item ids in persisted map at ingest time before dual-write) |
| `loadIngredientOperationalProfile` | Different mechanism — alias-to-invoice text matching, not ItemsTable matcher |
| Flag default | `VITE_MATCH_LIFECYCLE_READ_CUTOVER` defaults **OFF** — production behaves virtual-only until enabled |

### What's missing (intent-level, not implementation recommendations)

1. Loader wiring committed and flag enabled in VL/production
2. Orphan diagnostics cutover parity
3. Write-path alignment (`syncOperationalIngredientCostsFromInvoiceLines` ↔ dual-write lifecycle)
4. `ingredient_price_history` confirm gate (per match-responsibility audit)
5. Eventual virtual retirement after sustained parity + full backfill (aspirational, not coded)

---

## Phase 4 — Caller Classification

| Caller | Classification | Rationale |
|--------|----------------|-----------|
| `loadOperationalIngredientCostOverlay` | **Transitional → Hybrid** | Loader wiring completes cutover; virtual remains fallback |
| `buildLatestOperationalIngredientCostByIngredientIdFromScan` | **Transitional → Hybrid** | Build layer ready; always runs virtual then cutover |
| `loadLatestPurchaseGlanceByIngredientId` | **Transitional → Hybrid** | Same pattern |
| `buildLatestPurchaseGlanceByIngredientIdFromScan` | **Transitional → Hybrid** | Same |
| `loadIngredientMatchedInvoiceProducts` | **Transitional → Hybrid** | Same |
| `buildMatchedInvoiceProductsFromScan` | **Transitional → Hybrid** | Shared primitive |
| `syncOperationalIngredientCostsFromInvoiceLines` | **Required virtual (for now)** | Ingest-time write before persisted match exists; extract gate uses virtual state |
| `ingredient-orphan-diagnostics` | **Legacy** | Unwired cutover; still virtual-only |
| `loadIngredientOperationalProfile` | **Optional / separate** | Alias enrichment, not invoice line matching |
| `resolveInvoiceTableRowIngredientMatch` (primitive) | **Required permanent hybrid** | Virtual baseline + cutover overlay is the designed abstraction |

---

## Phase 5 — Production Scenarios

| Scenario | Flag OFF | Flag ON, no persisted row | Flag ON, persisted row |
|----------|----------|---------------------------|------------------------|
| **Existing confirmed invoices** | Virtual (aliases + matcher) | Virtual fallback (`missing_record`) | **Persisted** assignment + status |
| **New invoice, never reviewed** | Virtual suggested/confirmed via aliases | Virtual (no `invoice_item_matches` row yet) | N/A until shadow-seed/dual-write |
| **Re-read after user confirms in review** | Virtual reflects latest alias memory | Virtual unless dual-write created row | **Persisted** frozen decision |
| **Ingredient detail purchase history** | Virtual scan (5000 lines) | Hybrid | Hybrid — persisted wins |
| **Recipe operational overlay** | Virtual scan | Hybrid | Hybrid — cost from persisted-assigned lines |
| **Intentional status drift** (e.g. Prosciutto) | Virtual `confirmed` | — | Persisted `suggested` wins (audit: 🟡) |

**Scan model unchanged:** All paths still scan `invoice_items` (limit 5000, newest first). Persisted matches do not replace the scan — they replace **per-line assignment** inside the scan.

---

## Phase 6 — Decision Classification

### **Decision C — Mixed (intentional hybrid with transitional loader completion)**

| Sub-decision | Verdict |
|--------------|---------|
| **A — Intentional stay on virtual** | Partially: virtual is permanent **fallback** and **baseline** in `resolveInvoiceTableRowIngredientMatch` |
| **B — Transitional migrate to persisted** | Partially: loader wiring is the transitional step; **incomplete in `HEAD`, present in working tree** |
| **C — Mixed** | **Primary answer:** hybrid read architecture by design |

Virtual matcher is **not** a sign of abandoned migration alone — it is the designed compute path with an optional persisted override layer. The **unfinished** part is loader→persisted map wiring (done in working tree, not committed) and flag enablement.

---

## Return to Parent

| # | Question | Answer |
|---|----------|--------|
| 1 | Virtual matcher by design? | **Yes** — original overlay architecture; now also cutover fallback/baseline |
| 2 | Which callers permanent virtual? | `syncOperationalIngredientCostsFromInvoiceLines` (write/ingest); `resolveInvoiceTableRowIngredientMatch` always computes virtual; orphan diagnostics until wired |
| 3 | Which migrate to persisted? | All four audited read loaders + catalog review + invoice review (review already done); orphan diagnostics remains gap |
| 4 | Unfinished migration or intentional? | **Both:** hybrid is intentional; **loader wiring was unfinished in `HEAD`, completed in working tree** |
| 5 | Proceed with implementation? | **Mostly done in working tree** — commit loader wiring, enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER` in VL; orphan diagnostics + write path + price-history gate remain separate |
| 6 | Confidence | **91%** |

---

## Evidence References

- `src/lib/ingredient-operational-intelligence.ts` — overlay scan builders + loaders
- `src/lib/ingredient-pricing-freshness.ts` — purchase glance loader
- `src/lib/invoice-item-match-read-cutover.ts` — `resolveReadCutoverMatch`, `loadPersistedMatchByItemIdForScan` pattern
- `src/lib/invoice-ingredient-row-display.ts` — virtual-then-cutover entry point
- `src/lib/catalog-review-current-matches.ts` — schema comment documenting virtual-by-design
- `.tmp/match-responsibility-audit/REPORT.md` — boundary: recipe costing never touches matches
- `.tmp/match-read-cutover-completion/IMPLEMENTATION.md` — documents intended loader wiring
- Git: `da8ff44` (overlay origin), `41d8c4a` (cost aggregation), `8a054eb` (schema), `5b4a171` (cutover infra)
