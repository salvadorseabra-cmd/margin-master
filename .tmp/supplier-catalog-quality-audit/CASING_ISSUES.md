# Casing Issues — Supplier Names

**Date:** 2026-06-15

| # | Observed | Expected | Where | Severity |
|---|---|---|---|---|
| 1 | `AVILUDO` vs `Aviludo` | Aviludo | invoices.supplier_name (2 invoices) | **High** |
| 2 | `Avijudo` (OCR typo) | Aviludo | ingredient_aliases (≥3 Pepino rows) | **High** |
| 3 | `IL BOCCONCINO…` vs `…DISTRIBUIÇÃO…` | IL Bocconcino | DB vs extract casing | **Medium** |
| 4 | AVILUDO / Aviludo / Avijudo | Aviludo | aliases + price_history | **High** |

**Root cause:** `normalizeSupplierDisplayName()` preserves ALL-CAPS tokens. Alias lookup uses display name as scope key — casing splits alias memory. Watchlist merges on lowercase (inconsistent).

**Count:** 4 material casing issues.
