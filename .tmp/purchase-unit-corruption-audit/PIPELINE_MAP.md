# Pipeline Map — Invoice Description → Operational Cost

| # | Stage | File | Function | Input | Output |
|---|-------|------|----------|-------|--------|
| 1 | OCR table | `supabase/functions/extract-invoice/invoice-table-extraction.ts` | `extractTableItemsFromImage` | Invoice image | Raw line items |
| 2 | OCR reconcile | same | `finalizeExtractedLineItems` | Pass D + subtotal | Reconciled items |
| 3 | Match normalization | `src/lib/normalize-ingredient-name.ts` | `normalizeInvoiceIngredientName` | Raw name | Match key |
| 4 | Canonical identity | `src/lib/ingredient-identity.ts` | `canonicalizeIngredientIdentity` | Raw name | Core identity |
| 5 | Unit detect | `src/lib/ingredient-unit-inference.ts` | `detectVolume` / `detectWeight` / `detectPackQuantity` | Name | ml/g/pack signals |
| 6 | Combined inference | `src/lib/ingredient-unit-inference.ts` | `inferPurchaseUnitsFromLineItemName` | Name | `UnitInferenceResult` |
| 7 | Pack structure | `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` | Name | `PurchaseStructure` |
| 8 | Stock normalize | `src/lib/stock-normalization.ts` | `normalizeStockFromInvoiceLine` | Line + structure | Usable qty/unit |
| 9 | Structured format | `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat` | Line metadata | `StructuredPurchaseFormat` |
| 10 | Operational pricing | `src/lib/invoice-purchase-price-semantics.ts` | `recipeOperationalCostFieldsFromInvoiceLine` | Line metadata | cost fields |
| 11 | Catalog persist | `src/lib/ingredient-auto-persist.ts` | `buildIngredientInsertPayload` | Invoice item | `ingredients` row |
| 12 | Runtime resolve | `src/lib/resolve-operational-ingredient-cost.ts` | `resolveOperationalIngredientCostFields` | Catalog + overlay | Recipe cost |
| 13 | **Operational Cost UI** | `src/lib/ingredient-detail-panel.ts` | **`buildIngredientOperationalCostPresentation`** | `IngredientRow` | Display lines |
| 14 | UI render | `src/components/ingredient-detail-operational-layout.tsx` | component | `ingredient` | Section |

## Operational Cost UI field sources

| UI label | Source |
|----------|--------|
| Pack | `formatIngredientOperationalPackDetail` → `parsePurchaseStructureFromText(name)` or `purchase_quantity` + `purchase_unit` |
| Quantity purchased | `purchase_quantity` + `purchase_unit` |
| Usable quantity | structure `totalUsableAmount` or `purchase_quantity` when base is g/ml |
| Cost per unit/kg/L | `effectiveIngredientUnitCostEur()` = `current_price / purchase_quantity` |
