# April Trace — 17 Apr Aviludo

| Field | Value |
|-------|-------|
| invoice_id | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| item_id | `ff2ad683-3e89-4601-91b6-d467493fb116` |
| qty | 2 `un` |
| unit_price | **€6.29** |
| line_total | **€12.58** |
| price_history row | `61c51696` — **new_price=€3.145** ❌ (should be €6.29) |

**Bug:** Pipeline divided unit price by qty=2 → stored €3.145 in `ingredient_price_history`.
