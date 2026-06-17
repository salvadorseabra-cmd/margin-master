# Non-Food Filter Analysis — Lenha Invoice

**Date:** 2026-06-15

## Verdict: **Not the cause**

| Check | Result |
|-------|--------|
| `isNonFoodInvoiceLine("Lenha para pizzaria")` | **false** (only matches recargo+combustib) |
| Used in extraction persistence? | **No** — Review & Create only |
| `shouldRejectInvoiceIngredientRow("Lenha para pizzaria")` | **false** |

Lenha/wood/firewood/fuel are **not** classified as non-food by current blocklist.

Failure occurs **before** any client-side filter — 0 raw items from extraction.
