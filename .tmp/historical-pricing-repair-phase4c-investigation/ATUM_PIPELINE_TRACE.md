# Atum Pipeline Trace — Historical Pricing Repair Phase 4C (Pre-Repair)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · live `validate-repair-scope.mts` run 2026-06-14T23:26Z  
**Mode:** Read-only investigation (no code/data changes)

---

## Ingredient catalog (today)

| Field | Value |
|---|---|
| ID | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` |
| `current_price` | 13.10 |
| `purchase_quantity` | 1 |
| `unit` / `base_unit` | `g` |
| Operational (catalog) | **13.10** |

---

## Purchase 1 — April 2026 (INCORRECT history)

| Stage | Detail |
|---|---|
| **Invoice** | `c2f52357-0f80-491a-ba14-c97ff4837472` · 2026-04-17 · AVILUDO |
| **Item** | `ff2ad683-3e89-4601-91b6-d467493fb116` · confirmed-override |
| **Raw line** | Atum Óleo Bolsa Nau Catrineta **1 Kg** · qty **2** `un` · unit_price **€6.29** · total €12.58 |
| **Raw math** | `2 × 6.29 = 12.58` ✓ · implied unit price = **6.29** (per bag) |
| **Usable stock** | 2000 g (2 × 1 kg) — stock path correct |
| **Extraction / format** | `resolveInvoiceLinePurchaseFormat` → `weight_or_volume`, usable 2000 g |
| **Unit family** | `inferUnitFamily` → **countable** (row unit `un`, not `kg`) |
| **Purchase qty** | `resolveCountablePurchaseQuantityForCost` → **2** (`rowQty`) |
| **Pack price** | `current_price = 6.29` |
| **Operational** | `operationalUnitPriceForPriceHistory(6.29, 2)` = **3.145** |
| **History row** | `61c51696-acd8-4a58-878f-a588c1878af0` · `new_price=3.145` · prev=null · Δ%=null · `created_at=2026-04-17T12:00` |
| **True economics** | **€6.29/kg** (per 1 kg bag) |

---

## Purchase 2 — May 2026 (delta semantics INCORRECT)

| Stage | Detail |
|---|---|
| **Invoice** | `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` · 2026-05-19 · Aviludo |
| **Item** | `79956d1b-230e-46dc-af1e-03e2989031bd` · confirmed-override |
| **Raw line** | Atum Oleo Bolsa Nau Catrineta **1 Kg** · qty **1** `un` · unit_price **€13.10** · total €13.10 |
| **Purchase qty** | **1** → operational **13.10** (pipeline-consistent) |
| **Prior chain** | `resolvePreviousOperationalPriceForHistory` → **3.145** from April row |
| **Delta** | `(13.10 − 3.145) / 3.145 × 100 = **+316.5%**` (arithmetically exact, economically wrong) |
| **History row** | `781ab1ac-39d2-4462-9106-635e5603c466` · prev=3.145 · new=13.10 · Δ%=316.53 · `created_at=2026-05-19T12:00` (4B repaired) |
| **True kg move** | `(13.10 − 6.29) / 6.29 × 100 = **+108%** |

---

## End-to-end pipeline (both purchases)

```
invoice_items → normalizeInvoiceItemFields
  → resolveInvoiceLinePurchaseFormat (usable g)
  → recipeOperationalCostFieldsFromInvoiceLine
    → inferUnitFamily → countable
    → resolveCountablePurchaseQuantityForCost → rowQty when unit=un
  → persistOperationalIngredientCostFromInvoiceLine
    → ingredients.current_price / purchase_quantity
    → appendIngredientPriceHistoryFromInvoiceLine
      → storedNew = operationalUnitPriceForPriceHistory(pack, purchase_qty)
      → ingredient_price_history.new_price (operational €/base)
```

---

## Verdict

April history stores half the true per-bag price because the pipeline divides `unit_price` by `rowQty` even when `unit_price` is already per item. May `new_price` is correct; the 316% delta is a downstream artifact of the April row.
