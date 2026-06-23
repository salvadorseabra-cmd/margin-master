# Mozzarella vs Pellegrino — Structural Separation Audit

Generated: 2026-06-22T21:05:18.221Z  
VL: bjhnlrgodcqoyzddbpbd  
Mode: **STRICT READ-ONLY**

## Goal

Evidence-only audit: what runtime differences exist between MOZZARELLA FIOR DI LATTE 125GR*8 and SAN PELLEGRINO 75CL*15 (Bocconcino + Emporio)? Mozzarella must scale by invoice qty; Pellegrino must not. Proposed Option A helper scales both incorrectly.

## TASK 1 — Full Structure Trace Table

| Field | Mozzarella | Pellegrino (Boc) | Pellegrino (Emp) |
|-------|------------|------------------|------------------|
| lineName | MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 | ACQUA S.PELLEGRINO (CX 75CL*15) | SanPellegrino - Acqua in vitro 75cl x 15ud |
| tier | size_count | size_count | size_count |
| matchedText | 125GR*8 | 75CL*15 | 75cl x 15ud |
| innerUnitCount | 8 | 15 | 15 |
| unitSize | 125 | 75 | 75 |
| unitMeasurement | g | cl | cl |
| totalUsableAmount | 1000 | 11250 | 11250 |
| purchaseQuantity | 1 | 1 | 1 |
| rowQty | 10 | 2 | 2 |
| rowUnit | un | un | un |
| resolveStructurePurchaseQty | 1 | 1 | 1 |
| usableSource | structure_total | structure_total | structure_total |
| normalizedUsable | 1000 | 11250 | 11250 |
| usableUnit | g | ml | ml |
| opCost | €81.20/kg | €3.73/L | €3.43/L |

## TASK 2 — Parser Output Field Comparison

Production replay of `parsePurchaseStructureFromText`, `resolveInvoiceLinePurchaseFormat`, `computeUsableFromPurchaseStructure`.

### MOZZARELLA FIOR DI LATTE 125GR*8
```json
{
  "parsePurchaseStructureFromText": {
    "purchaseQuantity": 1,
    "purchaseFormat": "unit",
    "innerUnitCount": 8,
    "unitSize": 125,
    "unitMeasurement": "g",
    "totalUsableAmount": 1000,
    "usableUnit": "g",
    "matchedText": "125GR*8",
    "tier": "size_count"
  },
  "computeUsableFromPurchaseStructure": {
    "purchaseContainerCount": 1,
    "usableQuantity": 1000,
    "usableUnit": "g",
    "unitFamily": "mass",
    "usableSource": "structure_total",
    "fallbackReason": "name N×SIZE total is final; generic row does not rescale inner pack",
    "weak_scalar_activated": false
  },
  "resolveInvoiceLinePurchaseFormat": {
    "kind": "multi_unit_pack",
    "purchaseContainerCount": 8,
    "normalizedUsableQuantity": 1000,
    "usableQuantityUnit": "g",
    "packageQuantity": 125,
    "packageMeasurementUnit": "g"
  },
  "priceSemantics": {
    "singleUnitReplayUsable": 1000,
    "singleUnitEqualsLineUsable": true,
    "resolveUsablePerPricedUnit": {
      "amount": 1000,
      "unit": "g"
    },
    "resolveCountablePurchaseQuantityForCost": 1,
    "effectiveUsableCost": {
      "cost": 81.19999999999999,
      "unit": "kg"
    },
    "effectiveUsableCostLabel": "€81.20 / kg"
  }
}
```

### SAN PELLEGRINO 75CL*15 (Bocconcino)
```json
{
  "parsePurchaseStructureFromText": {
    "purchaseQuantity": 1,
    "purchaseFormat": "unit",
    "innerUnitCount": 15,
    "unitSize": 75,
    "unitMeasurement": "cl",
    "totalUsableAmount": 11250,
    "usableUnit": "ml",
    "matchedText": "75CL*15",
    "tier": "size_count"
  },
  "computeUsableFromPurchaseStructure": {
    "purchaseContainerCount": 1,
    "usableQuantity": 11250,
    "usableUnit": "ml",
    "unitFamily": "volume",
    "usableSource": "structure_total",
    "fallbackReason": "name N×SIZE total is final; generic row does not rescale inner pack",
    "weak_scalar_activated": false
  },
  "resolveInvoiceLinePurchaseFormat": {
    "kind": "multi_unit_pack",
    "purchaseContainerCount": 15,
    "normalizedUsableQuantity": 11250,
    "usableQuantityUnit": "ml",
    "packageQuantity": 75,
    "packageMeasurementUnit": "cl"
  },
  "priceSemantics": {
    "singleUnitReplayUsable": 11250,
    "singleUnitEqualsLineUsable": true,
    "resolveUsablePerPricedUnit": {
      "amount": 11250,
      "unit": "ml"
    },
    "resolveCountablePurchaseQuantityForCost": 1,
    "effectiveUsableCost": {
      "cost": 3.7279999999999998,
      "unit": "L"
    },
    "effectiveUsableCostLabel": "€3.73 / L"
  }
}
```

### SAN PELLEGRINO 75CL*15 (Emporio)
```json
{
  "parsePurchaseStructureFromText": {
    "purchaseQuantity": 1,
    "purchaseFormat": "unit",
    "innerUnitCount": 15,
    "innerUnitType": "unit",
    "unitSize": 75,
    "unitMeasurement": "cl",
    "totalUsableAmount": 11250,
    "usableUnit": "ml",
    "matchedText": "75cl x 15ud",
    "tier": "size_count"
  },
  "computeUsableFromPurchaseStructure": {
    "purchaseContainerCount": 1,
    "usableQuantity": 11250,
    "usableUnit": "ml",
    "unitFamily": "volume",
    "usableSource": "structure_total",
    "fallbackReason": "name N×SIZE total is final; generic row does not rescale inner pack",
    "weak_scalar_activated": false
  },
  "resolveInvoiceLinePurchaseFormat": {
    "kind": "multi_unit_pack",
    "purchaseContainerCount": 15,
    "normalizedUsableQuantity": 11250,
    "usableQuantityUnit": "ml",
    "packageQuantity": 75,
    "packageMeasurementUnit": "cl"
  },
  "priceSemantics": {
    "singleUnitReplayUsable": 11250,
    "singleUnitEqualsLineUsable": true,
    "resolveUsablePerPricedUnit": {
      "amount": 11250,
      "unit": "ml"
    },
    "resolveCountablePurchaseQuantityForCost": 1,
    "effectiveUsableCost": {
      "cost": 3.4275555555555557,
      "unit": "L"
    },
    "effectiveUsableCostLabel": "€3.43 / L"
  }
}
```

## TASK 3 — Generic Row Analysis

All three classified as **generic row** via `isGenericPurchaseUnit('un')` → true (unit in GENERIC_PURCHASE_UNITS).

**Exact code path (identical for all three):**

1. `parsePurchaseStructureFromText` → `SIZE_COUNT_RE` match → tier `size_count`, `purchaseQuantity=1`
2. `resolveStructurePurchaseQuantity` (1149-1150): `structureTotalIsFinalForGenericRow` → **true** (hasInner>1) → returns **1**
3. `computeUsableFromPurchaseStructure` (1278-1288): `structureTotalIsFinalForGenericRow` → **true** → `structure_total` branch
4. fallbackReason: `"name N×SIZE total is final; generic row does not rescale inner pack"`

**Why Bocconcino `(CX 75CL*15)` is not caixa tier:** `CAIXA_UNITS_SIZE_RE` expects `cx <inner> <unit> x <size><unit>` (inner count before size). Name has `CX 75CL*15` (size before count) → falls through to `SIZE_COUNT_RE`.

## TASK 4 — SIZE_COUNT Intermediate Values

| Intermediate | Mozzarella (125GR*8 qty=10) | Pellegrino (75CL*15 qty=2) |
|--------------|----------------------------|----------------------------|
| matchedToken | 125GR*8 | 75CL*15 |
| expression | 1 × 8 × 125 g | 1 × 15 × 75 cl |
| perItemBase | 125 | 750 |
| totalUsableAmount | 1000 g | 11250 ml |
| purchaseQuantity (name) | 1 | 1 |
| rowQuantity | 10 | 2 |
| rowQty ≠ innerCount | true | true |
| resolveStructurePurchaseQty | 1 | 1 |
| scaledOuterWouldBe (if applied) | 10000 | 22500 |

## TASK 5 — Distinguishing Signal Search

| Signal | Mozzarella | Pellegrino (Boc) | Pellegrino (Emp) | Runtime Available? | Separates? |
|--------|------------|------------------|------------------|--------------------|------------|
| structure.tier | size_count | size_count | size_count | Yes | No |
| isGenericPurchaseUnit(rowUnit) | true | true | true | Yes | No |
| structureTotalIsFinalForGenericRow | true | true | true | Yes | No |
| usableSource | structure_total | structure_total | structure_total | Yes | No |
| resolveStructurePurchaseQuantity | 1 | 1 | 1 | Yes | No |
| structure.unitMeasurement | g | cl | cl | Yes | **Yes** |
| structure.unitSize | 125 | 75 | 75 | Yes | **Yes** |
| structure.innerUnitCount | 8 | 15 | 15 | Yes | **Yes** |
| bound.qty (invoice row qty) | 10 | 2 | 2 | Yes | **Yes** |
| structure.totalUsableAmount | 1000 | 11250 | 11250 | Yes | **Yes** |
| chain.usableUnit (mass g vs volume ml) | g | ml | ml | Yes | **Yes** |
| matchedText / SIZE_COUNT token | 125GR*8 | 75CL*15 | 75cl x 15ud | Yes | **Yes** |
| name contains CX/caixa token | false | true | false | Yes | **Yes** |
| parser tier caixa_units_size (design assumption) | false | false | false | Yes | **Yes** |
| priceSemantics.singleUnitEqualsLineUsable | true | true | true | Yes | No |
| priceSemantics.effectiveUsableCost correct vs UI | 81.20/kg (UI bug) | 3.73/L (UI ok) | 3.43/L (UI ok) | Yes | **Yes** |
| proposedHelper.wouldFire (Option A) | true | true | true | Yes | No |
| proposedHelper + unitMeasurement==='g' only | true | false | false | Yes | **Yes** |
| rowQty !== innerCount | true | true | true | Yes | No |
| resolveInvoiceLinePurchaseFormat.kind | multi_unit_pack | multi_unit_pack | multi_unit_pack | Yes | No |
| purchaseContainerCount (structured) | 8 | 15 | 15 | Yes | **Yes** |

## TASK 6 — Minimum Difference Set (evidence only)

- **structure.unitMeasurement**: Mozzarella=g; Pellegrino Boc=cl; Emp=cl
- **structure.unitSize**: Mozzarella=125; Pellegrino Boc=75; Emp=75
- **structure.innerUnitCount**: Mozzarella=8; Pellegrino Boc=15; Emp=15
- **bound.qty (invoice row qty)**: Mozzarella=10; Pellegrino Boc=2; Emp=2
- **structure.totalUsableAmount**: Mozzarella=1000; Pellegrino Boc=11250; Emp=11250
- **chain.usableUnit (mass g vs volume ml)**: Mozzarella=g; Pellegrino Boc=ml; Emp=ml
- **matchedText / SIZE_COUNT token**: Mozzarella=125GR*8; Pellegrino Boc=75CL*15; Emp=75cl x 15ud
- **name contains CX/caixa token**: Mozzarella=false; Pellegrino Boc=true; Emp=false
- **parser tier caixa_units_size (design assumption)**: Mozzarella=false; Pellegrino Boc=false; Emp=false
- **priceSemantics.effectiveUsableCost correct vs UI**: Mozzarella=81.20/kg (UI bug); Pellegrino Boc=3.73/L (UI ok); Emp=3.43/L (UI ok)
- **proposedHelper + unitMeasurement==='g' only**: Mozzarella=true; Pellegrino Boc=false; Emp=false
- **purchaseContainerCount (structured)**: Mozzarella=8; Pellegrino Boc=15; Emp=15

**Shared path (no separation):** tier, generic row, final-policy gate, usableSource, resolveStructurePurchaseQuantity, proposed helper wouldFire.

## TASK 7 — Readiness A/B/C

**B) Shared normalization path — scalar signals exist but proposed helper fires on all three**

All three share size_count + generic + structureTotalIsFinal path; unitMeasurement g vs cl separates at scalar level but Option A helper fires on both cl rows

## Confidence

- Structure trace: **96%**
- Parser replay: **94%**
- Signal search: **91%**
- Minimum difference set: **89%**
- Overall: **92%**

Evidence: `.tmp/mozzarella-vs-pellegrino-separation/separation.json`