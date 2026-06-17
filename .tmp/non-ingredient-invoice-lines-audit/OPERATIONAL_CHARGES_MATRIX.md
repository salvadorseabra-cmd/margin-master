# Operational Charges Matrix

**Date:** 2026-06-15

| Charge type | Example patterns | Blocklist? | Invoice Review | Review & Create |
|-------------|------------------|------------|----------------|-----------------|
| **Fuel surcharge** | Recargo por combustibili | ✅ `isNonFoodInvoiceLine` | No Match | **Excluded** |
| **Delivery / transport** | portes, transporte | ❌ | No Match if unmatched | **Would appear** |
| **Pallet fee** | palete, pallet | ❌ | No Match if unmatched | **Would appear** |
| **Deposit / consignment** | consigna, depósito | ❌ | No Match if unmatched | **Would appear** |
| **Environmental / ecotax** | taxa ambiental | ❌ | No Match if unmatched | **Would appear** |
| **Payment / tax metadata** | IVA, Total documento | N/A | **Hidden** (`shouldRejectInvoiceIngredientRow`) | Never in pipeline |

Only Recargo is covered today. Other operational fees would incorrectly enter Review & Create if unmatched.
