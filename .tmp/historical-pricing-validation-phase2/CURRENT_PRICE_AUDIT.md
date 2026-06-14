# Current Price Audit — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

**Scope:** Atum em óleo and Mozzarella fior di latte — catalog `current_price` vs latest valid purchase vs latest history row.

---

## Atum em óleo · `0f30ccb3-bb47-40bb-83cc-ae2a4018066d`

| Source | Value | Correct? |
|---|---|---|
| `ingredients.current_price` | 13.10 (op €13.10) | ✅ Latest **confirmed** purchase |
| Latest confirmed purchase | May Aviludo · €13.10/kg-bag | ✅ |
| Latest history by **invoice chronology** | €13.10 (`781ab1ac`) | ✅ |
| Latest history by **`created_at DESC`** | €3.145 (`61c51696` Apr) | ❌ 4× understate |
| `current_price = latest_history × pq` | 3.145 × 1 = 3.145 ≠ 13.10 | ❌ if revert fires |

**Math:** Catalog is correct. History ordering is wrong. Delta chain is semantically wrong.

**Tags:** Catalog **Safe to ignore** · History queries **Requires fix**

---

## Mozzarella fior di latte · `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`

| Source | Value | Correct? |
|---|---|---|
| `ingredients.current_price` | 13.69 (op €13.69) | ✅ Latest **confirmed** 2kg block |
| Latest confirmed purchase | Apr Aviludo 2Kg · €13.69 | ✅ |
| Latest history by **invoice chronology** | €0.812 (May 8 Bocconcino) | ❌ wrong SKU |
| Latest history by **`created_at DESC`** | €0.812 (`18bdb0c5`) | ❌ |
| `current_price_from_latest_history` | false | ❌ |

**Math:** Catalog correct. History latest ≠ catalog because poison row + wrong sort base.

**Tags:** Catalog **Safe to ignore** · History queries **Active contamination** · **Requires fix**

---

## Revert risk

`revertIngredientCurrentPriceFromHistory` uses `fetchLatestHistoryNewPrice` (`created_at DESC`):

| Ingredient | Revert would set | Risk |
|---|---|---|
| Atum | ~€3.15 | **Requires fix** before any revert |
| Mozzarella | ~€0.81 | **Requires fix** before any revert |

---

## Summary

| Ingredient | `current_price` on catalog | Latest valid purchase | Latest history row (by `created_at DESC`) | Mathematically correct catalog? |
|---|---|---|---|---|
| Atum em óleo | €13.10 | May Aviludo €13.10/kg | Apr €3.145 (wrong denominator) | ✅ **Yes** |
| Mozzarella fior di latte | €13.69 | Apr Aviludo 2Kg €13.69 | May Bocconcino €0.812 (poison) | ✅ **Yes** |

**Conclusion:** `current_price` on the catalog is OK for both ingredients. History queries and revert paths are wrong.
