# Forward Trace — Key Rows

## Atum Apr (c2f52357)

| Field | Invoice | Expected | Stored | Match |
|-------|---------|----------|--------|-------|
| 2 un @ €6.29, total €12.58 | — | pq=1, op **€6.29** | **€3.145** | ❌ |
| Catalog (2026-06-16) | — | pq=1 | **pq=2** | ❌ |

## Gema líquida

| 6 un @ €10.19 | — | op **€10.19** | **€1.698** | ❌ |
| 6 un @ €10.49 (May) | — | op **€10.49** | **€1.748** | ❌ |

## Clean paths

| Product | Expected | Stored | Match |
|---------|----------|--------|-------|
| Pepino cx (pq=6) | €3.665 | €3.665 | ✅ |
| Arroz cx (pq=12) | €1.121 | €1.121 | ✅ |
| Atum May (qty=1) | €13.10 | €13.10 | ✅ |
| Hortelã kg | €0.00674 | €0.00674 | ✅ |
