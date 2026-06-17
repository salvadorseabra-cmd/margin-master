# Alert Calculation Trace

## +108% alert (user sees)

**Source:** `buildIngredientOperationalSignals` — purchase memory comparison

```
Old = €6.29 (Apr unit_price)
New = €13.10 (May unit_price)
(13.10 - 6.29) / 6.29 × 100 = +108.3%
```

**Economically correct** — compares invoice unit prices.

## +316% in DB (price_history)

```
previous = €3.145 (wrong April stored price)
new = €13.10
(13.10 - 3.145) / 3.145 × 100 = +316.5%
```

Insight cards prefer purchase comparison → user sees +108%, not +316%.
