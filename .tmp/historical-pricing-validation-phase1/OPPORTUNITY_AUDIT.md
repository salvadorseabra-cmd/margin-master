# Opportunity Audit — Historical Pricing Validation Phase 1

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14

## Price change % (`computePriceHistoryDelta`)

| Row | Stored Δ% | Recomputed | Match? |
|---|---|---|---|
| All Pepino/Arroz rows | — | — | ✅ exact |
| Anchoas May | +5.27% | +5.27% | ✅ |
| Atum May | **+316.5%** | +316.5% | ✅ math, ❌ semantics |
| Gema May | +2.94% | +2.94% | ✅ |

Delta recomputation via `computePriceHistoryDelta(previous_price, new_price)` matches stored `delta` and `delta_percent` on every audited row.

## UI signals (`buildIngredientOperationalSignals`)

- Driven by `priceActivity` = **first linked row when `created_at DESC`**
- Atum: picks April row (**null delta**) → **no `catalog-price-trend` signal** despite 316% row existing
- Threshold: `|delta_percent| >= 5` for trend signal

### Atum signal gap (live)

```
priceActivity: April row, delta=null, delta_percent=null
→ No catalog-price-trend signal emitted
→ 316% May spike exists in history but invisible in ingredient card signals
```

## Margin alerts (`generateIngredientInflationSpikeAlerts`)

- Filters by `created_at >= spikeSince` — corrupted 2023 timestamps may **exclude** May-2026 spikes OR **include** them in wrong window
- Atum 316% would qualify (`strongAbsolute: pct >= 18`) **if row falls in window** — misleading magnitude
- Mozzarella 0.812 row could trigger **false deflation** vs 13.69 baseline

## Savings / opportunity surfaces

- Category pressure uses operational intelligence spike vs 3mo (`operational-intelligence-view.ts`)
- **Corrupted ordering + mixed pack contracts** → savings/opportunity text unreliable for Atum, Mozzarella, multi-un lines
- Pepino + Arroz opportunity math: **trustworthy**

## Alert reliability by ingredient

| Ingredient | Price change % trustworthy | Savings/opportunity trustworthy |
|---|---|---|
| Pepino | ✅ | ✅ |
| Arroz | ✅ (catalog); ⚠️ UI ordering | ✅ |
| Anchoas | ⚠️ wrong base, wrong % magnitude | ⚠️ |
| Gema | ⚠️ wrong base | ⚠️ |
| Atum | ❌ 316% false spike | ❌ |
| Mozzarella | ❌ cross-SKU baseline | ❌ |
