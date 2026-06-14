# Localized Mozzarella Investigation

**Mode:** READ-ONLY · **Workspace:** margin-master · **VL project:** `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-13 (live Supabase query + code-path replay)

---

## Executive summary

Two incompatible mozzarella pack formats (AVILUDO 2 kg block vs IL BOCCONCINO 125GR×8 tray) share one catalog ingredient (`2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`). The UI shows a **41% cost decrease** by comparing raw invoice `unit_price` values (€8.12 vs €13.69) — different physical units. **Verdict: INVALID** (evidence in `verdict.json`).

---

## 1. Ingredient identity trace

### Facts

| Field | AVILUDO (2026-04-17) | IL BOCCONCINO (2026-05-08) |
|-------|----------------------|----------------------------|
| `invoice_id` | `c2f52357-0f80-491a-ba14-c97ff4837472` | `f0aa5a08-86a3-4938-99f0-711e86073968` |
| `invoice_item_id` | `cf79d75e-b648-433b-8458-a3da140c12bb` | `efb979b3-0a24-41f6-92a8-cb257f27106a` |
| `ingredient_id` | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` |
| `ingredient_name` | Mozzarella fior di latte | Mozzarella fior di latte |
| Extracted product name | Mozzarella Flor di Latte 2Kg | MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 |

- **Same ingredient record:** both purchases resolve to `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` (verified live; only one mozzarella row in catalog).
- `invoice_items` has **no** `ingredient_id` column — linkage is runtime via invoice matcher + aliases.
- Catalog: `current_price=13.69`, `purchase_quantity=1`, `base_unit=un`, `purchase_unit=un`.
- Aliases (confirmed): `Mozzarella Fior di Latte 2Kg`, `Mozzarella Flor di Latte 2Kg` → same ingredient.

### Observations

- Prior audit (`.tmp/historical-pricing-integrity-audit/per-ingredient/2a99cecd-*.json`) recorded Bocconcino `unit_price=9.5`; **live DB now shows `8.12`** (invoice re-read / discount normalization). History row updated to `new_price=0.812` (not 0.95).

### Hypotheses

- Bocconcino was matched to Aviludo mozzarella via normalized token overlap (`mozzarella fior di latte`) without a persisted pack-variant dimension (consistent with `.tmp/ingredient-identity-architecture-audit/identity-findings.json` W1).

**Artifact:** `identity-trace.json`

---

## 2. Raw invoice items (persisted)

### Facts — AVILUDO

| Field | Value |
|-------|-------|
| quantity | 1 |
| unit | un |
| unit_price | **13.69** |
| total | 13.69 |
| operational (replay) | `current_price=13.69`, `purchase_quantity=1`, `cost_base_unit=un`, `usable_weight_grams=2000` |

### Facts — BOCCONCINO

| Field | Value |
|-------|-------|
| quantity | 10 |
| unit | un |
| unit_price | **8.12** |
| total | 81.23 |
| operational (replay) | `current_price=8.12`, `purchase_quantity=10`, `cost_base_unit=un`, `usable_weight_grams=125` |

### Observations

- `81.23 / 10 = 8.123` — `unit_price` is **per tray** (net/discounted), not line total.
- Purchase history display uses `unit_price` directly (`formatPurchasePrice` → `€8.12`), not operational `new_price`.

**Artifact:** `invoice-items-trace.json`

---

## 3. `ingredient_price_history` rows

### Facts (3 rows, all `ingredient_id=2a99cecd-...`)

| id | invoice | created_at | previous_price | new_price | delta_percent | invoice_item_id |
|----|---------|------------|----------------|-----------|---------------|-----------------|
| `3c508a43-...` | Aviludo | 2026-04-17 | null | **13.69** | null | *(column absent in schema)* |
| `9ee1b793-...` | Aviludo | 2026-04-17 | 13.69 | **13.69** | 0 | — |
| `18bdb0c5-...` | Bocconcino | 2026-05-08 | null | **0.812** | null | — |

- **€13.69** in purchase history UI → Aviludo row `new_price=13.69` **and** `invoice_items.unit_price=13.69`.
- **€8.12** in purchase history UI → `invoice_items.unit_price=8.12` only; **not** stored in `ingredient_price_history`.
- Latest history row (Bocconcino): `previous_price=null`, `delta_percent=null` → `historyPercent()` returns null.

### Observations

- P0 guard: latest Bocconcino row `p0GuardTrusted=false`; `purchaseContractsChainCompatible` → `{ compatible: false, reason: "pack_weight_magnitude" }`.
- Post-P0: OI margin alerts for mozzarella suppressed (`before-after.json`: alerts 2→0).

**Artifact:** `price-history-trace.json`

---

## 4. Calculation reconstruction (code paths)

### Formulas (from source)

```
recipeOperationalCostFieldsFromInvoiceLine(metadata)
  → countable: { current_price: unit_price, purchase_quantity: rowQty, cost_base_unit: "un" }

operationalUnitPriceForPriceHistory(packPrice, purchase_quantity)
  = resolvedOperationalUnitCostEur({ current_price: packPrice, purchase_quantity })
  = packPrice / purchaseQuantityDenom(purchase_quantity)
  = packPrice / max(purchase_quantity, 1)
```

### Calculations — AVILUDO

```
unit_price = 13.69, quantity = 1, unit = un
→ current_price = 13.69, purchase_quantity = 1
→ stored new_price = 13.69 / 1 = 13.69
```

### Calculations — BOCCONCINO

```
unit_price = 8.12, quantity = 10, unit = un
→ current_price = 8.12, purchase_quantity = 10  (resolveCountablePurchaseQuantityForCost returns rowQty for "un")
→ stored new_price = 8.12 / 10 = 0.812
```

### Observations

- Display path (`buildRecentPurchases`) uses `unit_price` **without** dividing by quantity → **€8.12**.
- History path divides by `purchase_quantity` → **€0.812** operational `new_price`.
- Same nominal `cost_base_unit=un` masks different physical packs (2 kg block vs 125 g tray).

**Artifact:** `calculation-chain.json`

---

## 5. Operational summary “cost decreased 41%”

### Facts

- User-reported copy: *“cost decreased 41% since your last invoice”*.
- Reconstructed: `((8.12 − 13.69) / 13.69) × 100 = −40.6866…%` → `Math.abs(Math.round(...)) = **41**`.

### Code path

1. `ingredient-detail-operational-layout.tsx` calls `buildIngredientOperationalSignals` **without** `latestHistoryRow` or `priceHistory`.
2. Therefore the `else if (sortedPurchases.length >= 2)` branch runs (`buildIngredientOperationalSignals.ts` L401–420).
3. Compares `parsePriceLabel(sortedPurchases[0].priceLabel)` vs `[1]` → **8.12 vs 13.69**.
4. `costChangeLabel(name, pct, "since your last invoice")` → `"cost decreased 41% since your last invoice"`.

### Best buy / Highest paid

- `buildIngredientPurchaseInsights` → min/max of `priceLabel` from purchases.
- **Best:** €8.12 (Bocconcino) · **Highest:** €13.69 (Aviludo).

### P0 guard effect

| Surface | Post-P0 behavior |
|---------|------------------|
| OI / margin alerts | Mozzarella price-movement alerts **suppressed** (untrusted chain) |
| Ingredient detail “41%” signal | **Still shown** — uses purchase `unit_price` fallback, not guarded history |
| `buildOperationalInsightCards` | Only emits **increase** cards (`current > priorPrice * 1.03`); no decrease card at 41% |

**Artifact:** `operational-summary-trace.json`

---

## 6. Economic validation

### A) Equivalent units (€/kg)

| Purchase | Evidence | Implied €/kg |
|----------|----------|--------------|
| Aviludo 2Kg block | `usable_weight_grams=2000`, total €13.69 | 13.69 / 2 = **€6.85/kg** |
| Bocconcino 125GR×8 tray | Parsed `usable_weight_grams=125` (not 1000) | 8.12 / 0.125 = **€64.96/kg** if 125 g; or **€8.12/kg** if 1 kg/tray |

- Parser records **125 g** per item, not 8×125 g — `*8` not reflected in `usable_weight_grams`.
- Even if 1 kg/tray: €8.12/kg vs €6.85/kg → Bocconcino is **more expensive** per kg, not 41% cheaper.

**Conclusion (fact-based):** Not a valid €/kg comparison.

### B) Package prices (same pack format)

| Purchase | Pack semantics | Price |
|----------|----------------|-------|
| Aviludo | 1 × 2 kg block | €13.69 / pack |
| Bocconcino | 1 × (125GR×8) tray, qty 10 | €8.12 / tray, €81.23 line total |

- Different pack sizes and suppliers — not the same SKU/pack contract.

**Conclusion (fact-based):** Not a valid pack-to-pack comparison.

---

## Verdict

**INVALID** — see `verdict.json` (confidence 92%).

The 41% decrease is arithmetically correct on **raw invoice unit prices** but economically meaningless because the two lines price **different physical packs** under one collapsed `ingredient_id`.

---

## Artifacts

| File | Contents |
|------|----------|
| `identity-trace.json` | Ingredient IDs, aliases, same-record proof |
| `invoice-items-trace.json` | Persisted line fields + operational replay |
| `price-history-trace.json` | All history rows + P0 guard flags |
| `calculation-chain.json` | Step-by-step Aviludo / Bocconcino math |
| `operational-summary-trace.json` | −41% formula + best/highest + P0 effect |
| `verdict.json` | VALID/INVALID with evidence array |
| `run-investigation.mts` | Read-only query + replay harness |

## Related audits read

- `.tmp/historical-pricing-integrity-audit/per-ingredient/2a99cecd-08fb-48d5-87cf-cc9ea5282a6d.json` (stale: unit_price 9.5)
- `.tmp/p0-identity-guard-validation/before-after.json`
- `.tmp/ingredient-identity-architecture-audit/identity-findings.json`
