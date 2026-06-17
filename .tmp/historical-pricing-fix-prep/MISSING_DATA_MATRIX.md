# Missing Data Matrix — Persist Callers

**Legend**

- ✅ = field present at `operationalCostFieldsFromInvoiceLine` input
- ❌ = field absent (production gap)
- **pq** = `purchase_quantity` outcome for representative lines
- **op** = stored operational unit price (`operationalUnitPriceForPriceHistory`)

`line_total` is required for `isUnitPricePerPricedUnit()` to return `pq=1` on multi-`un` per-item-priced lines.

---

## Flow matrix

| Flow | Entry function | Caller file | quantity | unit | unit_price | line_total (`total`) | purchase_quantity outcome | op outcome (examples) |
|------|----------------|-------------|:--------:|:----:|:----------:|:--------------------:|---------------------------|------------------------|
| **Invoice upload** | `runExtraction` → `syncOperationalIngredientCostsFromInvoiceLines` | `invoices.tsx:1486` | ✅ | ✅ | ✅ | ❌ | Atum 2 un → **pq=2**; Gema 6 un → **pq=6**; Pepino 1 cx → pq=6; Arroz 1 cx → pq=12 | Atum **€3.145**; Gema **€1.698**; Pepino €3.665 ✅; Arroz €1.121 ✅ |
| **Invoice re-extract** | `reExtract` → `runExtraction` → same sync | `invoices.tsx:2393→1486` | ✅ | ✅ | ✅ | ❌ | Same as upload; **refreshExisting=true** overwrites history | Same contamination; **repairs revert** |
| **Invoice confirm** (match confirm) | `confirmIngredientMatch` → `persistIngredientCorrectionForItem` → `persistOperationalIngredientCostFromInvoiceLine` | `invoices.tsx:2047→1947` | ✅ | ✅ | ✅ | ❌ | Same multi-`un` bug | Same |
| **Manual match / select ingredient** | `selectIngredientForItem` → `persistIngredientCorrectionForItem` | `invoices.tsx:2095→1947` | ✅ | ✅ | ✅ | ❌ | Same | Same |
| **Ingredient operational sync** | `syncOperationalIngredientCostsFromInvoiceLines` | `ingredient-operational-intelligence.ts:952` | ✅ | ✅ | ✅ | ❌ | Type `InvoiceLineOperationalCostSyncInput` has **no `total` field** (L916–922) | Same |
| **Re-read flows** | Same as re-extract | `invoices.tsx:2393` | ✅ | ✅ | ✅ | ❌ | Re-persists all matched lines on existing invoices | Regression vector for Phase 4C repairs |
| **History backfill** (script) | `backfillIngredientPriceHistoryFromInvoices` | `ingredient-price-history-backfill.ts:62` | ✅ | ✅ | ✅ | ❌ | DB query does not select `total` | Re-contaminates if re-run |

---

## DB vs sync boundary (upload / re-extract)

| Stage | `total` present? |
|-------|------------------|
| OCR / extract response (`normalizedItems`) | ✅ `ItemRow.total` |
| `invoice_items` INSERT payload (`invoices.tsx:1461`) | ✅ `total: it.total ?? null` |
| `syncOperationalIngredientCostsFromInvoiceLines` items map (`L1490–1495`) | ❌ **dropped here** |
| `persistOperationalIngredientCostFromInvoiceLine` item (`L1950–1954`) | ❌ |
| `operationalCostFieldsFromInvoiceLine` → `line_total` (`ingredient-auto-persist.ts:82`) | ❌ `item.total` undefined |

---

## Expected vs actual (with fix wiring)

| Product | Invoice line | With `line_total` | Production (no `line_total`) |
|---------|--------------|-------------------|------------------------------|
| Atum Apr | 2 un @ €6.29, total €12.58 | pq=1, op **€6.29** | pq=2, op **€3.145** ❌ |
| Gema | 6 un @ €10.19, total €61.14 | pq=1, op **€10.19** | pq=6, op **€1.698** ❌ |
| Pepino | 1 cx @ €22.49 | pq=6, op €3.665 | same ✅ |
| Arroz | 1 cx @ €13.95 | pq=12, op €1.121 | same ✅ |
| Atum May | 1 un @ €13.10 | pq=1, op €13.10 | same ✅ (qty=1, detection N/A) |
| Nata | 5 cx @ €18.89 | pq from case structure | same ✅ (cx path) |
| Chocolate | 2 cx @ €29.99 | pq from case structure | same ✅ |

---

## Tests vs production

| Surface | Passes `line_total`? | Evidence |
|---------|---------------------|----------|
| `invoice-purchase-price-semantics.test.ts` | ✅ | Atum/Gema tests use `line_total` (L146–180) |
| `ingredient-price-history-persistence.test.ts` | ❌ for persist integration | Persist tests use cx/kg lines only; Gema re-extract test asserts ÷6 (L471) |
| `ingredient-operational-intelligence-extract-gate.test.ts` | ❌ | Fixture items omit `total` (L29–44) |
| `scripts/validate-historical-pricing.mts` | ✅ | Passes `total` through pipeline |
| Production `invoices.tsx` | ❌ | Scenario B confirmed |
