# History Integrity Audit

**Date:** 2026-06-16  
**Source:** Live VL DB `bjhnlrgodcqoyzddbpbd`

**Method:** Compare `expected_operational` vs `ingredient_price_history.new_price` (not raw unit_price — pack splits are legitimate).

## Contaminated rows (10 / 27)

| Ingredient | Date | Unit Price | History Price | Expected Op | Difference | Error % |
|---|---|---:|---:|---:|---:|---:|
| Atum em óleo | 2026-04-17 | €6.29 | €3.145 | €6.29 | −€3.145 | 50% |
| Anchoas | 2026-04-17 | €9.49 | €4.745 | €9.49 | −€4.745 | 50% |
| Anchoas | 2026-05-19 | €9.99 | €4.995 | €9.99 | −€4.995 | 50% |
| Gema líquida | 2026-04-17 | €10.19 | €1.698 | €10.19 | −€8.492 | 83% |
| Gema líquida | 2026-05-19 | €10.49 | €1.748 | €10.49 | −€8.742 | 83% |
| Guanciale stagionato | 2026-05-19 | €10.83 | €1.806 | €10.83 | −€9.024 | 83% |
| Mozzarella fior di latte (Bocconcino) | 2026-05-08 | €8.12 | €0.812 | €8.12 | −€7.308 | 90% |
| Mozzarella fior di latte (Mammafiore) | 2026-05-19 | €20.03 | €2.003 | €20.03 | −€18.027 | 90% |
| Stracciatella 250gr | 2026-05-08 | €3.11 | €0.130 | €3.11 | −€2.980 | 96% |
| Birra peroni 33cl | 2026-05-19 | €1.07 | €0.0446 | €0.00324 | +€0.0413 | 1275% |

**Clean:** 17 rows (Pepino, Nata, Arroz, Chocolate, Atum May, etc.)
