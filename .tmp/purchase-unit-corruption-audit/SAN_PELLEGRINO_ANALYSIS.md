# San Pellegrino Deep Dive — `SanPellegrino - Acqua in vitro 75cl x 15ud`

**Evidence:** Parser replay 2026-06-17; `.tmp/purchase-price-semantics-audit/SAN_PELLEGRINO_CASE_STUDY.md`; `.tmp/emporio-italia-investigation/invoice-items.json`

---

## Invoice ground truth

| Field | Value |
|-------|-------|
| Quantity | 2 |
| Unit | cx (cases) |
| Unit price | €19.30 list → **€19.28/case** effective |
| Line total | **€38.56** |
| Supplier | Emporio Italia |
| Date | 2026-06-10 |

**Correct economics:**

| Metric | Calculation | Value |
|--------|-------------|-------|
| Per case | €38.56 ÷ 2 | €19.28 |
| Per bottle | €19.28 ÷ 15 | **€1.29/bottle** |
| Per litre | 15 × 750ml = 11.25 L; €19.28 ÷ 11.25 | **€1.71/L** |

---

## Why `75cl x 15ud` is not parsed as 15-pack

`parsePurchaseStructureFromText` tier order:

1. `UNITS_SIZE_RE` expects **`15 un x 75 cl`** (count BEFORE size) — does not match.
2. `BAKERY_PIECE_THEN_UNIT_COUNT_RE` expects tail **`75cl 15 un`** with `un` token — fails because suffix is **`15ud`**.
3. `GENERIC_INNER_UNIT_TOKEN` = `un|uni|und|…` — **`ud` is not included**.
4. Falls through to **`bare_measure`** on embedded `75cl` only.

Result structure:

```
tier: bare_measure
matchedText: "75cl"
unitSize: 750 ml (75 × 10)
innerUnitCount: null   ← 15 lost
```

Alternate format `ACQUA S.PELLEGRINO (CX 75CL*15)` — same failure: `(CX 75CL*15)` not matched as container tier; still bare_measure on `75CL`.

---

## Parser → pricing → UI chain (2 cx @ €19.28)

### `resolveInvoiceLinePurchaseFormat`

| Field | Value |
|-------|-------|
| kind | `weight_or_volume` |
| packageQuantity | 750 ml |
| normalizedUsableQuantity | 1500 ml (2 × 750) |
| purchaseContainerCount | 2 |

### `recipeOperationalCostFieldsFromInvoiceLine`

Takes **volume path** (usable per priced unit = 750 ml per case):

```json
{
  "current_price": 19.28,
  "purchase_quantity": 750,
  "cost_base_unit": "ml"
}
```

**Bug semantics:** Case pack price divided by **bottle volume in ml**, not by **15 bottles** or **11.25 L**.

### `computeEffectiveUsableCost`

`isCaseRowWithEmbeddedPieceWeightOnly` → suppresses €/L display → `{ cost: 19.28, unit: "case" }` on invoice card.

Operational Cost panel still uses catalog fields → **€19.28 / 750 = €0.026/ml**.

### Operational Cost UI (replay)

| Line | Parsed UI | User report |
|------|-----------|-------------|
| Pack | `1 unit · 750 ml · → 750 ml utilizável` | ~“Pack 750 …” |
| Quantity purchased | `750 ml` | “750 un” when `inferIngredientCostBaseUnit` → `un` |
| Usable quantity | `750 ml` | — |
| Unit cost | `€0.03` (per ml) | “€0.03/unit” (misread or inferred `un`) |

**Why “750 un” appears:** `cost_base_unit` is **not a DB column**. `inferIngredientCostBaseUnit` (`ingredient-unit-cost.ts:77-87`) returns `un` when `purchase_quantity=750` (< 1000) unless overlay provides explicit base. KPI / cost lines can show **€0.03/unit** while quantity line shows **750 ml**.

---

## Emporio OCR compounding risk

VL live row (`.tmp/purchase-unit-intelligence-audit/EDGE_CASE_AUDIT.md`):

| Field | Extracted | Likely truth |
|-------|-----------|--------------|
| qty | 2 | 2 cases ✓ |
| unit | **ml** | **cx** |

Wrong row unit can route line through **WEIGHTED/volume** pipeline before confirm.

---

## Root cause summary

| Cat | Finding | Confidence |
|-----|---------|------------|
| **B** | Reverse pack grammar `SIZE x Nud` unsupported; `ud` not in inner tokens | **High** |
| **E** | Case € price used as numerator with 750 ml denominator | **High** |
| **F** | Base-unit inference maps 750 → countable `un` | **Medium–High** |
| **A** | Optional ml/cx unit swap on unmatched Emporio rows | **Medium** |

Not canonicalization (display name correctly strips `15ud` for catalog suggestion).
