# Final Implementation Plan — Historical Pricing Persistence

**Date:** 2026-06-16  
**Scenario:** B (library fix exists; production callers not wired)  
**Constraints:** Read-only prep complete — implementation not started.

---

## 1. Exact root cause

Production persist paths call `operationalCostFieldsFromInvoiceLine` **without `total`**, so `line_total` is undefined when `resolveCountablePurchaseQuantityForCost` runs.

For multi-`un` lines where `unit_price` is **per priced unit** (bag/tin/pack) and `total ≈ qty × unit_price`:

1. `isUnitPricePerPricedUnit()` never fires (requires `line_total`)
2. `purchase_quantity` is set to **row quantity** (e.g. 2, 6)
3. `operationalUnitPriceForPriceHistory(packPrice, purchase_quantity)` divides again
4. Stored `ingredient_price_history.new_price` and catalog operational cost are **÷qty too low**

**Examples:**

| Line | Stored (bug) | Expected |
|------|-------------|----------|
| Atum 2×€6.29 | €3.145 | €6.29 |
| Gema 6×€10.19 | €1.698 | €10.19 |

Fix logic exists in `src/lib/invoice-purchase-price-semantics.ts:180–194` and is wired in `operationalCostFieldsFromInvoiceLine` (L82) — but **callers never pass `total`**.

---

## 2. Exact callers to modify

| Priority | File | Function / site | Add field |
|----------|------|-----------------|-----------|
| P0 | `src/routes/invoices.tsx:1490–1495` | `runExtraction` → sync items map | `total: it.total ?? null` |
| P0 | `src/routes/invoices.tsx:1950–1954` | `persistIngredientCorrectionForItem` | `total: item.total ?? null` |
| P0 | `src/lib/ingredient-operational-intelligence.ts:916–922` | `InvoiceLineOperationalCostSyncInput` type | `total?: number \| null` |
| P0 | `src/lib/ingredient-operational-intelligence.ts:999–1004` | `syncOperationalIngredientCostsFromInvoiceLines` | `total: item.total ?? null` |
| P0 | `src/lib/ingredient-auto-persist.ts:104` | `persistOperationalIngredientCostFromInvoiceLine` item type | include `"total"` in Pick |
| P1 | `src/lib/ingredient-price-history-backfill.ts` | select + normalize | `total` from DB |
| P2 | `src/lib/ingredient-operational-intelligence.ts:878–883` | overlay scan (display) | `total: normalized.total` |

**Do not modify:** `appendIngredientPriceHistoryFromInvoiceLine`, `isUnitPricePerPricedUnit`, `operationalUnitPriceForPriceHistory`.

---

## 3. Number of files

| | Count |
|---|------:|
| Production source files | **4** |
| Test files | **3** |
| **Total** | **7** |

---

## 4. Number of tests

| Action | Count |
|--------|------:|
| Tests to update | **1** (Gema re-extract refresh — `ingredient-price-history-persistence.test.ts:429–475`) |
| New tests recommended | **3** (Atum persist, Gema persist, sync forward `total`) |
| Tests already covering semantics | **4** (`invoice-purchase-price-semantics.test.ts` Atum/Gema/Anchoas/aggregate) |
| **Total test touch count** | **~4 files/cases** |

---

## 5. Estimated implementation complexity

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Code change size | **Small** | ~15–25 lines across 4 files; type extensions only |
| Logic complexity | **Low** | No new algorithms — wire existing field |
| Test effort | **Medium** | Must flip Gema re-extract test; add multi-`un` persist cases |
| Data repair | **Medium** | Re-run `repair-multi-un-history.mts` after deploy |
| Deploy risk | **Low–Medium** | cx/kg paths isolated; OCR `total` quality on edges |

**Overall: Small code / Medium validation** — ~2–4 hours engineering + repair/validation cycle.

---

## 6. Confidence %

| Claim | Confidence |
|-------|------------|
| Root cause (Scenario B, missing `total`) | **98%** |
| Caller identification complete | **95%** |
| Repair overwrite mechanism (refresh via re-extract/sync) | **90%** |
| Fix approach (wire `total`, no semantics change) | **95%** |
| No regression on Pepino/Arroz/Nata/Chocolate | **92%** |
| **Overall implementation plan** | **93%** |

Residual uncertainty: exact user action at 2026-06-16T17:13Z (re-extract vs bulk sync) — mechanism is proven regardless.

---

## Post-implementation checklist

- [ ] Wire `total` at all P0/P1 sites
- [ ] Update tests; run `vitest` on touched files
- [ ] Deploy
- [ ] `npx vite-node scripts/repair-multi-un-history.mts --execute`
- [ ] `npx vite-node scripts/validate-historical-pricing.mts`
- [ ] `npx vite-node scripts/validate-repair-scope.mts`
- [ ] Spot-check Atum Apr `new_price=6.29`, May Δ% ≈ 108%

---

## Deliverables index

| File | Purpose |
|------|---------|
| `CALLER_TRACE.md` | Full path to `appendIngredientPriceHistoryFromInvoiceLine` |
| `MISSING_DATA_MATRIX.md` | Per-flow field presence |
| `REPAIR_REGRESSION_TRACE.md` | Phase 4C → revert mechanism |
| `IMPLEMENTATION_SCOPE.md` | Files, functions, tests |
| `RISK_ASSESSMENT.md` | Product-level blast radius |
| `FINAL_IMPLEMENTATION_PLAN.md` | This document |

---

## Return to parent

| Root cause proven? | Callers identified? | Repair overwrite explained? | Files to modify | Confidence |
|--------------------|-----------------------|-----------------------------|-----------------|------------|
| **YES** — missing `total` → double-divide on multi-`un` | **YES** — 2 direct, 3 indirect production paths + backfill | **YES** — re-extract/sync refresh UPDATE via `appendIngredientPriceHistoryFromInvoiceLine` | **4** prod + **3** test | **93%** |
