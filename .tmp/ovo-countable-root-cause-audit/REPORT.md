# Ovo Classe M Countable Conversion Root Cause Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Audited:** 2026-06-24  
**Product:** `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)`  
**Invoice:** Bidfood `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` (2026-05-25)

---

## FINAL VERDICT: **C — Purchase structure parser fails**

**What exact code path prevents 1 case of 15 dozen eggs from becoming 180 recipe eggs?**

`parsePurchaseStructureFromText` in `stock-normalization.ts` receives the **full, untruncated** product name but returns **`null`**. No regex tier recognizes `Cx.15 dúzias`:

- `dúzias` / `dz` / `dozen` are absent from `MEASURE_UNIT_TOKEN` and `INNER_UNIT_TOKEN` (lines 155–162).
- `SIZE_COUNT_RE` / `UNITS_SIZE_RE` require a volume/mass suffix (`33cl`, `75cl`, `80g`) — eggs have none.
- `CAIXA_COUNT_ONLY_RE` (`\bcx\s*\d+`) does not match `Cx.15` because the dot separator breaks the pattern (`Cx.` ≠ `cx` + optional whitespace + digits).
- Even a hypothetical `cx 15` match would still fail: `caixaCountOnly` branch requires `findEmbeddedPieceMeasure` (per-piece g/ml in the title), which eggs lack.

Downstream cascade:

1. `resolveInvoiceLinePurchaseFormat` → `kind: "row_only"`, `normalizedUsableQuantity: null`
2. `resolveUnitsPerPack` → `null`
3. `resolveUsablePerPricedUnit` → `null` → `computeEffectiveUsableCost` → `null` (operational cost suppressed)
4. `resolveCountablePurchaseQuantityForCost` (cx row, no unitsPerPack) → **`1`**
5. `operationalCostFieldsFromInvoiceLine` → persists `purchase_quantity: 1`, `cost_base_unit: "un"`
6. Recipe costing: `effectiveIngredientUnitCostEur = 38.44 / 1 = €38.44` per recipe `un` (whole case, not per egg)

---

## Q1 — Raw OCR / Extraction

| Field | Value |
|-------|-------|
| name | `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` |
| quantity | `1` |
| unit | `cx` |
| unit_price | `38.44` |
| total | `38.44` |
| raw_text | Full name preserved in `invoice_items.name` |

**Did extraction capture 15, dúzias, carton?** **YES**

- `15` — present in name (`Cx.15`)
- `dúzias` — present in name
- `carton` — `(CARTÃO)` present in name

After `normalizeInvoiceItemFields`: name unchanged, qty=1, unit=cx. Nothing stripped at normalization.

---

## Q2 — Purchase Structure Parsing

| Question | Answer |
|----------|--------|
| Parser input | Full text: `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` — **not truncated** |
| `parsePurchaseStructureFromText` | **`null`** (tier attempted: `none`) |
| `resolveInvoiceLinePurchaseFormat` | `kind: "row_only"`, `normalizedUsableQuantity: null`, `usableQuantityUnit: null`, `purchaseContainerCount: 1`, `purchaseContainerUnit: "cx"`, inference reason: `"no unit tokens matched"` |
| `resolveUnitsPerPack` | `null` |

Parser regex tiers checked (most specific first): `triple_nested`, `caixa_units_size`, `caixa_compact_size`, `units_size`, `size_count`, `caixa_count_only`, `container_leading`, `container_with_size`, `count_size`, `embedded_bare`, `bare_measure` — **none match**.

---

## Q3 — Countable Conversion Support

| Search term | Found? | Location / note |
|-------------|--------|-----------------|
| `dúzia` / `duzia` / `dozen` | **No** | Not in `stock-normalization.ts` regex tokens |
| `dz` as row unit | Yes | `invoice-item-fields.ts` INVOICE_UNIT_TOKEN; `invoices.tsx` display label only |
| `12 eggs per dozen` | **No** | No constant or conversion anywhere |
| `unitsPerPack` | Yes | `invoice-purchase-price-semantics.ts:719` — requires `multi_unit_pack` kind |
| `packCount` | Yes | `ingredient-unit-inference.ts` tests only (NxSIZE patterns) |
| `egg` / `ovo` noun | Yes | `inferCountableCostUnit` in `invoice-purchase-price-semantics.ts:391` — **unreachable** without parsed usable count |

Egg display noun exists; dozen→egg arithmetic does not.

---

## Q4 — Persistence Trace

**Exact persisted payload (VL ingredient `9f167402-9ea8-4fac-92dc-2cb11a525359`):**

| Field | Value |
|-------|-------|
| purchase_quantity | `1` |
| purchase_unit | `un` |
| usable_quantity | `null` |
| usable_unit | `null` |
| cost_base_unit | `un` |
| current_price | `38.44` |

**Why purchase_quantity = 1?**

`recipeOperationalCostFieldsFromInvoiceLine` → `resolveCountablePurchaseQuantityForCost`:

```587:604:src/lib/invoice-purchase-price-semantics.ts
export function resolveCountablePurchaseQuantityForCost(
  metadata: InvoicePurchasePriceMetadata,
  structured: StructuredPurchaseFormat,
): number | null {
  // ...
  if (rowUnit && PACK_CONTAINER_UNITS.has(rowUnit)) {
    const unitsPerPack = resolveUnitsPerPack(structured);
    if (unitsPerPack != null && unitsPerPack > 0) return unitsPerPack;
    return 1;
  }
```

Row unit `cx` is a pack container; `resolveUnitsPerPack` returns `null` because `structured.kind !== "multi_unit_pack"` → fallback **`1`**.

---

## Q5 — Working Countables Comparison

| Product | Parsed Structure | Purchase Qty (recipe denom) | Operational Qty |
|---------|------------------|----------------------------|-----------------|
| **Ovo Classe M** | `null` / `row_only` | **1** | **null** |
| **Peroni** `33cl*24` | `size_count`, inner=24, 33cl, total=7920ml | **7920** (ml) | 7920 ml → €/L |
| **Pellegrino** `75cl x 15ud` | `size_count`, inner=15, 75cl, total=11250ml | **11250** (ml) | 11250 ml → €/L |

**Why eggs fail:** Peroni/Pellegrino match `SIZE_COUNT_RE` (`Ncl × Mud` / `Ncl*M`) producing `multi_unit_pack` with measurable inner count. Eggs use `Cx.15 dúzias` — a **countable dozen unit** with no volume/mass token — which no parser tier handles. The pipeline never computes 15 × 12 = 180.

---

## Q6 — Smallest Missing Fact

**Single absent denominator at recipe costing:** **`180`** (total eggs per priced case)

Formula in use:

```
effectiveIngredientUnitCostEur = current_price / purchase_quantity
                               = 38.44 / 1
                               = €38.44 per recipe "un"
```

Required but never produced: `purchase_quantity = 180` (15 dozen × 12 eggs/dozen).

Hypothetical if denominator existed: `38.44 / 180 = €0.2136/egg`.

---

## REQUIRED TABLE — Stage | Representation

| Stage | Representation |
|-------|----------------|
| **OCR / DB invoice_items** | `{ name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)", quantity: 1, unit: "cx", unit_price: 38.44 }` |
| **normalizeInvoiceItemFields** | Same name; qty=1, unit=cx, unit_price=38.44 |
| **parsePurchaseStructureFromText** | `null` |
| **computeUsableFromPurchaseStructure** | `null` |
| **resolveInvoiceLinePurchaseFormat** | `{ kind: "row_only", normalizedUsableQuantity: null, usableQuantityUnit: null, purchaseContainerCount: 1, purchaseContainerUnit: "cx" }` |
| **resolveUnitsPerPack** | `null` |
| **resolveUsablePerPricedUnit** | `null` |
| **computeEffectiveUsableCost** | `null` (operational cost suppressed) |
| **resolveInvoiceLinePricingPresentation** | procurement: `€38.44 / case`; operational: `null` |
| **procurementPackFieldsFromInvoiceLine** | `{ current_price: 38.44, purchase_quantity: 1, purchase_unit: "un" }` |
| **operationalCostFieldsFromInvoiceLine** | `{ current_price: 38.44, purchase_quantity: 1, cost_base_unit: "un" }` |
| **ingredients DB** | `{ name: "Ovo classe M", current_price: 38.44, purchase_quantity: 1, base_unit: "un" }` |
| **recipeOperationalCostFieldsFromInvoiceLine** | `{ current_price: 38.44, purchase_quantity: 1, cost_base_unit: "un" }` |
| **Recipe costing (1 egg, unit=un)** | `directCountableLineCostEur(1, "un", fields) = 1 × (38.44/1) = €38.44` |

---

## Verdict Options Considered

| Option | Assessment |
|--------|------------|
| A — OCR never extracts | **Rejected** — full name with 15/dúzias/CARTÃO in DB |
| B — Normalization loses it | **Rejected** — name intact through `normalizeInvoiceItemFields` |
| **C — Parser fails** | **Selected** — root cause |
| D — Persistence drops | **Rejected** — nothing to drop; structure never parsed |
| E — Recipe costing ignores | **Rejected** — costing correctly divides by persisted `purchase_quantity=1` |
| F — Multiple failures | **Rejected** — single upstream parser gap causes entire downstream chain |

---

## Evidence Files

- `.tmp/ovo-countable-root-cause-audit/results.json` — machine-readable trace
- `.tmp/ovo-countable-root-cause-audit/audit.mts` — replay script (read-only VL queries + local pipeline trace)
- Prior audit: `.tmp/ovo-classe-m-audit/` (consistent findings)
