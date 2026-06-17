# Implementation Scope — Historical Pricing `line_total` Wiring

**Mode:** Plan only — no code changes in this phase.

---

## Production files to modify (4)

### 1. `src/routes/invoices.tsx`

| Location | Change |
|----------|--------|
| `runExtraction` → `syncOperationalIngredientCostsFromInvoiceLines` items map (L1490–1495) | Add `total: it.total ?? null` |
| `persistIngredientCorrectionForItem` → `persistOperationalIngredientCostFromInvoiceLine` (L1950–1954) | Add `total: item.total ?? null` |

**Functions touched:** `runExtraction`, `persistIngredientCorrectionForItem` (call sites only).

### 2. `src/lib/ingredient-operational-intelligence.ts`

| Location | Change |
|----------|--------|
| `InvoiceLineOperationalCostSyncInput` type (L916–922) | Add `total?: number \| null` |
| `syncOperationalIngredientCostsFromInvoiceLines` → `persistOperationalIngredientCostFromInvoiceLine` (L999–1004) | Pass `total: item.total ?? null` |
| `buildLatestOperationalIngredientCostByIngredientIdFromScan` (L878–883) | Pass `total: normalized.total ?? null` (overlay consistency — secondary) |

**Functions touched:** `syncOperationalIngredientCostsFromInvoiceLines`, `buildLatestOperationalIngredientCostByIngredientIdFromScan`.

### 3. `src/lib/ingredient-auto-persist.ts`

| Location | Change |
|----------|--------|
| `persistOperationalIngredientCostFromInvoiceLine` item param type (L104) | Extend to `Pick<AutoPersistInvoiceItem, "name" \| "quantity" \| "unit" \| "unit_price" \| "total">` |

`operationalCostFieldsFromInvoiceLine` already maps `item.total` → `line_total` (L82) — **no change needed** in semantics layer.

### 4. `src/lib/ingredient-price-history-backfill.ts`

| Location | Change |
|----------|--------|
| `BackfillInvoiceItemRow` type (L26–38) | Add `total: number \| null` |
| Supabase select (L84–86) | Add `total` column |
| `normalizeInvoiceItemFields` input (L108–114) | Pass `total: row.total` |
| `operationalCostFieldsFromInvoiceLine` call (L175) | Already receives normalized row if `total` included |

---

## Files NOT requiring modification

| File | Reason |
|------|--------|
| `src/lib/invoice-purchase-price-semantics.ts` | Fix already exists (`isUnitPricePerPricedUnit`, L180–194) |
| `src/lib/ingredient-price-history.ts` | `appendIngredientPriceHistoryFromInvoiceLine` correct given inputs |
| `src/lib/match-lifecycle-service.ts` | No pricing writes |

---

## Test files to modify (3)

### 1. `src/lib/ingredient-price-history-persistence.test.ts`

| Test | Change |
|------|--------|
| `refreshes existing invoice_id + ingredient_id on re-extract` (L429–475) | Update expectations: with `total` on persist line, `new_price` should be **10.49** not **10.49/6** |
| New: `persistOperationalIngredientCostFromInvoiceLine` multi-un Atum | `total: 12.58` → history `new_price ≈ 6.29`, `purchase_quantity: 1` |
| New: `persistOperationalIngredientCostFromInvoiceLine` multi-un Gema | `total: 61.14` → history `new_price ≈ 10.19` |

### 2. `src/lib/ingredient-operational-intelligence-extract-gate.test.ts`

- Add `total` to fixture items where multi-`un` scenarios are added
- Optional: new test verifying `total` forwarded to `persistOperationalIngredientCostFromInvoiceLine` spy

### 3. `src/lib/invoice-purchase-price-semantics.test.ts`

- **No changes required** — Atum/Gema/Anchoas coverage already present (L146–180)

### Optional (recommended)

| File | Change |
|------|--------|
| New integration test or extend `ingredient-operational-intelligence.test.ts` | `syncOperationalIngredientCostsFromInvoiceLines` end-to-end with Atum line + `total` |

---

## Scripts / data repair (post-deploy, out of code scope)

| Script | Action |
|--------|--------|
| `scripts/repair-multi-un-history.mts --execute` | Re-apply after production wiring |
| `scripts/validate-historical-pricing.mts` | Post-repair gate |
| `scripts/validate-repair-scope.mts` | `confirmed_multi_un_count` / suspect checks |

---

## Summary counts

| Category | Count |
|----------|------:|
| Production source files | **4** |
| Functions / call sites | **6** |
| Test files | **3** (2 required + 1 optional) |
| New test cases (estimated) | **3–4** |
| Semantics / history core files | **0** |

---

## Implementation sequence (recommended)

1. Extend types (`InvoiceLineOperationalCostSyncInput`, `persistOperationalIngredientCostFromInvoiceLine` item pick)
2. Wire `total` at `invoices.tsx` call sites (highest traffic)
3. Wire through `syncOperationalIngredientCostsFromInvoiceLines`
4. Fix backfill select + normalized pass-through
5. Update tests (especially Gema re-extract refresh test)
6. Run vitest on touched files
7. Re-run repair scripts on VL / production after deploy
