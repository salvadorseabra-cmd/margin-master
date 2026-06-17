# Ginger Beer Deep Dive — `Baladin - Ginger Beer 0.20cl`

**Evidence:** Parser replay 2026-06-17; `.tmp/ginger-beer-audit/parsing-chain.json`; `.tmp/emporio-italia-investigation/ginger-beer-item.json`

---

## Invoice ground truth

| Field | Visible / GT value |
|-------|-------------------|
| Description | `Baladin - Ginger Beer 0.20cl` |
| Quantity | 24 (column); extract also drifts to 2 cx |
| Unit price | €0.85 (24 un path) or €10.85 (2 cx path) |
| Line total | €19.38 |
| PDF SKU | `BBB-GINGER33ITA` (33cl — not persisted on line) |

---

## DB / ingredient state

| Query | Result |
|-------|--------|
| Matching `ingredients` | **0 rows** (unmatched on VL) |
| `ingredient_aliases` | **0 rows** |
| Persisted operational cost | **none** |

All bad Operational Cost numbers are **read-time** from `invoice_items.name` + scalars until ingredient is confirmed.

---

## Exact transformation chain

### Step 1 — OCR / extraction

Pass D copies description faithfully as `0.20cl`. Prior audit: not GPT invention; visible on supplier document (likely typo vs 33cl SKU).

### Step 2 — `detectVolume` (`ingredient-unit-inference.ts:135`)

```
Input:  "Baladin - Ginger Beer 0.20cl"
Normalize: "BALADIN - GINGER BEER 0.20CL"
Regex: (\d+(?:[.,]\d+)?)\s*CL → match "0.20CL"
parseQuantityToken("0.20") = 0.2
toMl(0.2) = 0.2 × 10 = 2 ml
Math.max(1, round(2)) = 2 ml
Output: { milliliters: 2, reason: 'volume token "0.20CL" (CL) → 2ml' }
```

### Step 3 — `parsePurchaseStructureFromText`

Tier: **`bare_measure`** on substring `0.20cl`  
→ `unitSize: 2`, `unitMeasurement: ml`, `totalUsableAmount: 2`

Does **not** infer 24-pack or 33cl from SKU.

### Step 4 — `resolveInvoiceLinePurchaseFormat` (24 un @ €0.85)

| Field | Value |
|-------|-------|
| kind | `weight_or_volume` |
| packageQuantity | 2 ml |
| normalizedUsableQuantity | 48 ml (24 × 2) |
| purchaseContainerCount | 24 |

### Step 5 — `recipeOperationalCostFieldsFromInvoiceLine`

| Field | Value |
|-------|-------|
| current_price | 0.85 |
| purchase_quantity | 24 |
| cost_base_unit | un |
| usable_volume_ml | 2 |

### Step 6 — Effective usable cost

`computeEffectiveUsableCost`: €0.85 ÷ 0.002 L = **€425/L**

With 2 cx @ €10.85: **€5,425/L** (matches reported UI when extract uses cx path).

### Step 7 — Operational Cost UI (24 un path)

| Line | Value |
|------|-------|
| Pack | `1 unit · 2 ml · → 2 ml utilizável` |
| Quantity purchased | `24 un` |
| Usable quantity | `2 ml` |
| Cost per unit | `€0.04` (0.85/24; misleading vs volume reality) |

---

## Root cause

| Layer | Verdict |
|-------|---------|
| A OCR | Source text contains `0.20cl` |
| B Parser | No multipack; bare_measure on bad token |
| **C Conversion** | **Primary:** decimal CL treated as 0.2 × 10 ml |
| E Pricing | Countable row + 2 ml usable overlay → absurd €/L |
| F UI | Displays parsed 2 ml faithfully |

**Isolated?** Unique `0.XXcl` decimal pattern in VL beverage scan (`.tmp/ginger-beer-audit/FINAL_VERDICT.md`). Integer CL (`75cl`, `33cl`) converts correctly.
