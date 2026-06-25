# Foundation Final Closure Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25T13:50:01Z

## Foundation Decision

### 🟡 CONDITIONAL

Procurement→operational normalization is deterministic and invoice presentation is correct. One match-lifecycle architectural gap (Prosciutto: history row from unconfirmed suggested match despite economics being sound). Ovo/Tomilho history rows store pack-level new_price (€38.44, €2.06) instead of operational €/egg and €/g — isolated VL sync artifacts, not normalization logic failures. Catalog purchase_quantity stale on produce items blocks recipe costing until backfill.

## Cross-Check Summary

| Check | Today |
|-------|-------|
| Recipe costing mathematically correct | **NO** |
| Operational Intelligence correct | **YES** |
| Historical Pricing trustworthy | **NO** |

| Architectural bugs | **1** |
| Sync artifacts | **2** |
| False alarms | **0** |

## Per-Ingredient Findings

### Prosciutto cotto scelto

| Field | Value |
|-------|-------|
| Root cause | **A — Match lifecycle: price_history written before match confirmation** |
| Severity | P1 |
| Architectural bug | yes |
| Sync artifact | no |
| Smallest correction | Gate price_history insert on confirmed match status; purge orphan row b0e17b8b-22d5-4b02-8477-dca1b913f986 until user confirms in Invoice Review |

**Trace highlights**

- PDF/persisted: {"qty":4.3,"unit":"kg","unit_price":8.5,"total":36.54}
- Line: {"id":"16435f8f-0fdc-4598-a9a9-f6b2713a7d86","name":"Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg","quantity":4.3,"unit":"kg","unit_price":8.5,"total":36.54}
- Normalization: op=0.0085
- Catalog: {"current_price":8.5,"purchase_quantity":1000,"purchase_unit":"g","catalogOp":0.0085,"catalogMatchesConfirmedLine":true}
- Match lifecycle: {"persistedStatus":"suggested","matchKind":"semantic","created_at":"2026-06-25T01:55:47.764971+00:00","updated_at":"2026-06-25T01:55:47.764971+00:00","virtualDisplay":"suggested","cutoverDisplay":"suggested","aliases":[{"ingredient_id":"b924480a-91f3-4aa2-9852-a900795a6f92","alias_name":"Assaporami Prosciutto Cotto Scelto HC 4,3-4,5Kg","normalized_alias":"assaporami prosciutto cotto sceltohc","supplier_name":"Emporio Italia","confirmed_by_user":true,"created_at":"2026-06-15T17:50:04.07604+00:00"}],"extractGateEnabled":true,"extractAuthorized":false}
- History (1 rows): [{"id":"b0e17b8b-22d5-4b02-8477-dca1b913f986","invoice_id":"ab52796d-de1d-418d-86e7-230c8f056f09","invoice_date":"2026-05-19","supplier":"Emporio Italia","previous_price":null,"new_price":0.0085,"delta":null,"delta_percent":null,"deltaMathValid":true,"lineOpMatch":true,"expectedOpAtInsert":0.0085,"orphanFromSuggestedMatch":true,"created_at":"2026-05-19T12:00:00+00:00"}]

### Ovo classe M

| Field | Value |
|-------|-------|
| Root cause | **A — History sync: new_price stored at pack level, not operational €/base-unit** |
| Severity | P1 |
| Architectural bug | no |
| Sync artifact | yes |
| Smallest correction | Backfill history row 0e70f19d-fdf2-4201-8a0c-0fa65712afd7: set new_price=0.21355555555555555 (operational); reconcile chain |

**Trace highlights**

- PDF/persisted: {"qty":1,"unit_price":38.44,"total":38.44,"note":"persisted=PDF"}
- Line: {"id":"480e66ee-dbee-4e2a-ac78-dc13a0f9fd63","name":"Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)","quantity":1,"unit":"cx","unit_price":38.44,"total":38.44}
- Normalization: op=0.21355555555555555
- Catalog: {"current_price":38.44,"purchase_quantity":1,"purchase_unit":"un","catalogOp":38.44,"expectedPurchaseQty":180,"catalogOpIsPack":true}
- Matching: {"persisted":"confirmed","virtual":"unmatched","cutover":"unmatched","aliases":[{"ingredient_id":"9f167402-9ea8-4fac-92dc-2cb11a525359","alias_name":"Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)","normalized_alias":"ovo moreno classe m duzias cartao 15","supplier_name":"Bidfood Portugal","confirmed_by_user":true,"created_at":"2026-06-15T14:00:25.977236+00:00"}]}
- History (1 rows): [{"id":"0e70f19d-fdf2-4201-8a0c-0fa65712afd7","invoice_id":"da472b7f-0fd9-4a26-a37c-80ad335f7f7e","invoice_date":"2026-05-25","supplier":"Bidfood Portugal","previous_price":null,"new_price":38.44,"delta":null,"delta_percent":null,"deltaMathValid":true,"lineOpMatch":false,"expectedOpAtInsert":0.21355555555555555,"orphanFromSuggestedMatch":false,"created_at":"2026-05-25T12:00:00+00:00"}]
- **Inconsistency:** appendIngredientPriceHistory stored new_price=38.44 (pack) vs line op 0.21355555555555555

### Tomilho

| Field | Value |
|-------|-------|
| Root cause | **A — History sync: new_price stored at pack level, not operational €/base-unit** |
| Severity | P1 |
| Architectural bug | no |
| Sync artifact | yes |
| Smallest correction | Backfill history row 25c318d5-64d8-4317-8d1e-57dff5aaa1e5: set new_price=0.0206 (operational); reconcile chain |

**Trace highlights**

- PDF/persisted: {"qty":1,"unit_price":2.06,"total":2.06,"note":"persisted=PDF"}
- Line: {"id":"f2d094ab-f50a-483d-b6cb-76554d5bf195","name":"Tomilho","quantity":1,"unit":"mo","unit_price":2.06,"total":2.06}
- Normalization: op=0.0206
- Catalog: {"current_price":2.06,"purchase_quantity":1,"purchase_unit":"un","catalogOp":2.06,"expectedPurchaseQty":100,"catalogOpIsPack":true}
- Matching: {"persisted":"confirmed","virtual":"confirmed","cutover":"confirmed","aliases":[{"ingredient_id":"ac8a9cc3-66cd-4a77-95cb-a3c8104b7041","alias_name":"Tomilho","normalized_alias":"tomilho","supplier_name":"Bidfood Portugal","confirmed_by_user":true,"created_at":"2026-06-15T14:00:29.901861+00:00"}]}
- History (1 rows): [{"id":"25c318d5-64d8-4317-8d1e-57dff5aaa1e5","invoice_id":"da472b7f-0fd9-4a26-a37c-80ad335f7f7e","invoice_date":"2026-05-25","supplier":"Bidfood Portugal","previous_price":null,"new_price":2.06,"delta":null,"delta_percent":null,"deltaMathValid":true,"lineOpMatch":false,"expectedOpAtInsert":0.0206,"orphanFromSuggestedMatch":false,"created_at":"2026-05-25T12:00:00+00:00"}]
- **Inconsistency:** appendIngredientPriceHistory stored new_price=2.06 (pack) vs line op 0.0206

## Recommendation

**Leave VL** after targeted backfill (no new bug hunt): (1) Confirm Prosciutto match or purge orphan history `b0e17b8b`; (2) Backfill Ovo/Tomilho history `new_price` to operational values and reconcile chains; (3) Re-run catalog persist for Ovo/Tomilho denominators. Enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER` for read-path consistency.