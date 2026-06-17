# Supplier List — VL Dataset

**Date:** 2026-06-15  
**Scope:** 6 invoices, 5 real-world suppliers. No `suppliers` table — identity is `invoices.supplier_name` text.

| supplier_name (DB) | invoice_count | invoice_total | first_seen | last_seen |
|---|---:|---:|---|---|
| Bidfood Portugal | 1 | €292.70 | 2026-06-09 | 2026-06-09 |
| AVILUDO | 1 | €370.17 | 2026-06-09 | 2026-06-09 |
| Aviludo | 1 | €330.42 | 2026-06-07 | 2026-06-07 |
| IL BOCCONCINO Distribuição ALIMENTAR | 1 | €290.64 | 2026-06-10 | 2026-06-10 |
| Emporio Italia | 1 | €327.46 | 2026-06-10 | 2026-06-10 |
| Mammafiore Portugal | 1 | €415.96 | 2026-06-10 | 2026-06-10 |

## Aggregated by real-world supplier

| Canonical supplier | Invoices | Total spend | DB variants |
|---|---:|---:|---|
| Aviludo | 2 | €700.59 | AVILUDO, Aviludo |
| Bidfood Portugal | 1 | €292.70 | — |
| IL Bocconcino | 1 | €290.64 | — |
| Emporio Italia | 1 | €327.46 | — |
| Mammafiore Portugal | 1 | €415.96 | — |

**Caveat:** Emporio has 0 `invoice_items` rows (wiped).
