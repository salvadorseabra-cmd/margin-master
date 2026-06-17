# Purchase History UI Trace

**Path:** `loadIngredientMatchedInvoiceProducts` → `unitPrice: normalized.unit_price` → `buildRecentPurchases` → `formatPurchasePrice`

**"Price / unit" column** renders `invoice_items.unit_price`, not line_total or price_history.

**UI correctly shows:** Apr €6.29, May €13.10.

**Not a UI bug** — display uses correct invoice unit prices.
