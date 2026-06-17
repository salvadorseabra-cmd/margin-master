# Persistence Trace — Invoice Upload → History Write

**Post-fix code paths (current codebase)**

---

## End-to-end chain

```
1. OCR extract-invoice
   invoices.tsx:1373 — supabase.functions.invoke("extract-invoice")

2. Normalize (preserves total)
   invoices.tsx:1399–1400 — normalizeInvoiceItemFields(it)
   invoice-item-fields.ts:164–171 — total = normalizeInvoiceNumberField(item.total)

3. Persist invoice_items (total in DB)
   invoices.tsx:1451–1461 — insertRows include total: it.total ?? null
   invoices.tsx:1466 — supabase.from("invoice_items").insert(insertRows)

4. Cost sync (total forwarded) ✅ FIX
   invoices.tsx:1486–1497 — syncOperationalIngredientCostsFromInvoiceLines(
     normalizedItems.map(it => ({ ..., total: it.total ?? null })))

5. Match + persist per line
   ingredient-operational-intelligence.ts:998–1007 — persistOperationalIngredientCostFromInvoiceLine(
     { ..., total: item.total ?? null })

6. Map total → line_total for semantics
   ingredient-auto-persist.ts:77–82 — line_total: item.total ?? undefined

7. isUnitPricePerPricedUnit fires (multi-un + matching total)
   invoice-purchase-price-semantics.ts:180–194, 474–476

8. History append
   ingredient-auto-persist.ts:142–155 — appendIngredientPriceHistoryFromInvoiceLine(
     newPrice: fields.current_price,
     newPurchaseQuantity: fields.purchase_quantity)
   ingredient-price-history.ts:149–159 — operationalUnitPriceForPriceHistory → stored new_price
```

---

## Alternate paths (also wired)

| Path | Location | `total` forwarded? |
|------|----------|-------------------|
| Match confirm / reassign | `invoices.tsx:1948–1957` | **Yes** |
| Re-extract | `reExtract` → same `runExtraction` chain | **Yes** |
| Admin backfill | `ingredient-price-history-backfill.ts:86,115,177` | **Yes** (from DB) |

---

## Verdict

`line_total` survives the full production persist chain. Gap at L1490–1495 (pre-fix) is closed.
