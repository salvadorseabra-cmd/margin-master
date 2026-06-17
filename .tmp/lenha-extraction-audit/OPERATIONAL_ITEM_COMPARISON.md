# Operational Item Comparison — Lenha vs Recargo

**Date:** 2026-06-15

| Aspect | Recargo (Mammafiore) | Lenha |
|--------|---------------------|-------|
| Extraction path | Same Pass D pipeline | Same |
| When crop correct | Extracted & persisted | Would persist |
| `isNonFoodInvoiceLine` | true → Review & Create excluded | false |
| `shouldRejectInvoiceIngredientRow` | false | false |
| This failure | N/A | **0 items before any filter** |

**Recargo:** downstream catalog/workflow exclusion after successful extraction.

**Lenha:** never reaches persistence — crop geometry failure upstream.

Same extraction path; **different failure stage**.
