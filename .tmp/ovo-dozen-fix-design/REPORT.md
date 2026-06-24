# Ovo Classe M Dozen Parsing Fix — Design (STRICT DESIGN ONLY)

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT DESIGN ONLY — no code changes, no DB writes, no deployments  
**Designed:** 2026-06-24  
**Product:** `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)`  
**Invoice:** Bidfood `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` (2026-05-25)  
**Ingredient:** Ovo classe M (`9f167402-9ea8-4fac-92dc-2cb11a525359`)

---

## FINAL VERDICT: **A — Ready**

**Confidence:** **High (92%)**

A minimal **dedicated dozen parser tier** in `parsePurchaseStructureFromText` is sufficient. VL evidence shows a single isolated failure (1/52 invoice lines). No persistence or recipe-costing changes are required — the existing `un`-countable pipeline already computes `purchase_quantity` from `normalizedUsableQuantity` when `usableQuantityUnit === "un"`. The fix is parser-only, inserted before existing tiers that could partially overlap (`caixa_count_only`).

**Residual risk (8%):** future non-egg products with `Cx.N dúzias` would inherit dozen→egg arithmetic; mitigated by requiring an explicit dozen unit token (not bare `cx N`).

---

## 1. Current Flow Table + Insertion Point

| Stage | File / function | Ovo representation today | After fix (expected) |
|-------|-----------------|--------------------------|----------------------|
| **OCR / extraction** | GPT / supplier PDF → `invoice_items` | `{ name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)", quantity: 1, unit: "cx", unit_price: 38.44 }` | Unchanged |
| **Normalization** | `normalizeInvoiceItemFields` (`invoice-item-fields.ts`) | Name intact; qty=1, unit=cx | Unchanged |
| **Parser** | `parsePurchaseStructureFromText` (`stock-normalization.ts`) | **`null`** — no tier matches `Cx.15 dúzias` | **`PurchaseStructure`** tier `caixa_dozen_count`, totalUsableAmount=180, usableUnit=`un` |
| **Usable derivation** | `computeUsableFromPurchaseStructure` → `normalizePurchasedToUsableStock` | `usableQuantity: null`, source=`inference` | `usableQuantity: 180`, source=`purchase_structure` |
| **Structured format** | `resolveInvoiceLinePurchaseFormat` (`invoice-purchase-format.ts`) | `kind: "row_only"`, `normalizedUsableQuantity: null` | `kind: "multi_unit_pack"`, `normalizedUsableQuantity: 180`, `usableQuantityUnit: "un"` |
| **Operational cost fields** | `recipeOperationalCostFieldsFromInvoiceLine` (`invoice-purchase-price-semantics.ts`) | `purchase_quantity: 1`, `cost_base_unit: "un"` | `purchase_quantity: 180`, `cost_base_unit: "un"` |
| **Persistence** | `operationalCostFieldsFromInvoiceLine` → `catalogPersistFieldsFromInvoiceLine` (`ingredient-auto-persist.ts`) | `purchase_quantity: 1`, `purchase_unit: "un"`, `usable_quantity: null` | `purchase_quantity: 180`, `purchase_unit: "un"`, `usable_quantity: 180`, `usable_unit: "un"` |
| **Recipe costing** | `ingredientLineCostEur` → `directCountableLineCostEur` (`recipe-prep-cost.ts` / `usable-unit-conversion.ts`) | `38.44 / 1 = €38.44` per recipe `un` | `38.44 / 180 = €0.2136` per egg |

### Insertion point (exact)

**File:** `src/lib/stock-normalization.ts`  
**Function:** `parsePurchaseStructureFromText`  
**Position:** After `caixa_compact_size` block (~line 702), **before** `units_size` (~line 704).

**Rationale:** Most-specific-first ordering. The new `CAIXA_DOZEN_RE` is more specific than `CAIXA_COUNT_ONLY_RE` (which requires embedded g/ml via `findEmbeddedPieceMeasure`). Placing it before `caixa_count_only` (~line 746) prevents a hypothetical dot-fixed `cx 15` match from firing without dozen semantics.

**No changes needed downstream** if parser emits a valid `PurchaseStructure` with `usableUnit: "un"` and `totalUsableAmount: 180`.

---

## 2. Design Options

### Option A — Dedicated dozen parser tier (RECOMMENDED)

Add `CAIXA_DOZEN_RE` + `buildStructure` call with `innerUnitCount = dozenCount`, `unitSize = 12`, `unitMeasurement = "un"`, new tier `caixa_dozen_count`.

| Pros | Cons |
|------|------|
| Minimal blast radius — VL scan shows 0 other dozen rows | New tier type in `PurchaseStructure["tier"]` union |
| Reuses existing `buildStructure` / `measureToBase(12, "un")` | Requires bypassing `parseSizeAndUnit` (rejects `un`) — call `buildStructure` directly |
| No persistence or costing code changes | |
| Dot separator (`Cx.15`) handled in regex | |

### Option B — Generic countable multiplier (extend `INNER_UNIT_TOKEN`)

Add `dúzias|dz|dozen` to `INNER_UNIT_TOKEN` / `GENERIC_INNER_UNIT_TOKEN` and teach `CAIXA_UNITS_SIZE_RE` to compose `cx N dúzias × 12`.

| Pros | Cons |
|------|------|
| Theoretically handles `24 dz × 6` style patterns | `parseSizeAndUnit` rejects `un` — needs broader refactor |
| | `CAIXA_UNITS_SIZE_RE` expects `MULTIPLIER_SEP` + measure suffix — pattern mismatch for bare dozen |
| | Higher regression surface on `caixa_units_size` tier |

### Option C — Inference-only / post-parser multiplier

Detect dozen in `inferPurchaseUnitsFromLineItemName` or add a special case in `resolveCountablePurchaseQuantityForCost`.

| Pros | Cons |
|------|------|
| Avoids new regex tier | Bypasses `purchase_structure` pipeline — stock display, operational intelligence, and pack phrase all stay `null` |
| | Duplicates logic outside single source of truth |
| | Does not fix `normalizedUsableQuantity` for stock/usable labels |

### Recommendation: **Option A**

VL corpus has exactly one `dozen_countable` row. Option A is the smallest correct fix aligned with existing `size_count` / `count_size` architecture.

---

## 3. Expected Parser Output Shape

Uses actual `PurchaseStructure` type from `stock-normalization.ts` (lines 34–53). No invented fields.

### Input

```
"Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)"
```

### Output (`parsePurchaseStructureFromText`)

```typescript
{
  purchaseQuantity: 1,
  purchaseFormat: "case",
  innerUnitCount: 15,
  innerUnitType: "dozen",
  unitSize: 12,
  unitMeasurement: "un",
  totalUsableAmount: 180,
  usableUnit: "un",
  matchedText: "Cx.15 dúzias",  // exact substring from regex match
  tier: "caixa_dozen_count",    // NEW — extends PurchaseStructure["tier"] union
}
```

### Multiplier chain (via `purchaseStructureMultiplierChain`)

```
expression: "1 × 15 × 12 un"
perItemBase: 12
totalUsableAmount: 180
```

### Downstream `purchaseStructureToPackPhrase`

```typescript
{
  kind: "multi_unit_pack",
  containerCount: 15,       // innerUnitCount
  packageQuantity: 12,
  packageUnit: "un",
  confidence: 0.98,
}
```

### Downstream `resolveInvoiceLinePurchaseFormat` (structured)

```typescript
{
  kind: "multi_unit_pack",
  purchaseContainerCount: 1,          // cx rowdivisor
  purchaseContainerUnit: "cx",
  packageQuantity: 12,
  packageMeasurementUnit: "un",
  normalizedUsableQuantity: 180,
  usableQuantityUnit: "un",
  stockNormalizationPipeline: "unified",
  reason: "purchase structure (caixa_dozen_count)",
}
```

---

## 4. Persistence Effect

Invoice line: `quantity=1, unit=cx, unit_price=38.44`

| Field | Before | After |
|-------|--------|-------|
| `current_price` | 38.44 | 38.44 |
| `purchase_quantity` | **1** | **180** |
| `purchase_unit` | `un` | `un` |
| `cost_base_unit` | `un` | `un` |
| `usable_quantity` | `null` | **180** |
| `usable_unit` | `null` | **`un`** |
| `base_unit` | `un` | `un` |

### Why `purchase_quantity = 180` (not 15)

`resolveCountablePurchaseQuantityForCost` first branch (lines 591–594):

```typescript
if (structured.usableQuantityUnit === "un" && structured.normalizedUsableQuantity != null) {
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  if (perUnit?.unit === "un" && perUnit.amount > 0) return perUnit.amount;  // → 180
}
```

For `cx` row with `quantity=1`, `resolveUsablePerPricedUnit` returns total usable (180 eggs), not `resolveUnitsPerPack` (15 dozens). This mirrors how mass/volume rows get total ml/g, but for countables the total is in `un`.

`inferCountableCostUnit("Ovo MORENO…")` → `"egg"` (display only; `cost_base_unit` stays `"un"`).

---

## 5. Recipe Costing — Marginly Formula

### Unit cost

```
resolvedOperationalUnitCostEur = current_price / purchase_quantity
                              = 38.44 / 180
                              = €0.213555…/un
```

(`ingredient-unit-cost.ts` → `resolvedOperationalUnitCostEur`)

### Line cost (recipe unit = `un`)

```
ingredientLineCostEur(qty, fields, { recipeUnit: "un" })
  → directCountableLineCostEur(qty, "un", fields)
  → qty × resolvedOperationalUnitCostEur
```

| Recipe qty | Formula | Line cost |
|------------|---------|-----------|
| **1 egg** | `1 × (38.44 / 180)` | **€0.2136** |
| **2 eggs** | `2 × (38.44 / 180)` | **€0.4271** |
| **6 eggs** | `6 × (38.44 / 180)` | **€1.2813** |
| **12 eggs** | `12 × (38.44 / 180)` | **€2.5627** |

### Operational display

`computeEffectiveUsableCost` → `{ cost: 0.2136, unit: "egg" }` (via `inferCountableCostUnit`).

---

## 6. Regression Matrix

Parser change per product: **would `parsePurchaseStructureFromText` return a different result?**

| Product | VL line (abbrev.) | Current tier | Parser change? | Notes |
|---------|-------------------|--------------|----------------|-------|
| **Peroni** | `33cl*24` | `size_count` | **NO** | No dozen token; `SIZE_COUNT_RE` unchanged |
| **Pellegrino** | `75cl x 15ud` | `size_count` | **NO** | `15ud` ≠ dozen unit |
| **Nata** | `6x1L` | `count_size` | **NO** | Volume tier |
| **Chocolate** | `10x200g` | `count_size` | **NO** | Mass tier |
| **Açúcar** | `10x1 Kg` | `count_size` | **NO** | Mass tier |
| **Mozzarella** | `125GR*8` | `size_count` | **NO** | Mass tier |
| **Guanciale** | `1,5kg*7` | `size_count` | **NO** | Mass tier |
| **Ginger Beer** | `0.20cl` | `bare_measure` | **NO** | Volume bare |
| **Salada** | `250g` | `bare_measure` | **NO** | Mass bare |
| **Ovo Líquido** | `1 Kg` | `bare_measure` | **NO** | Liquid egg — no dozen |
| **Ovo Classe M** | `Cx.15 dúzias` | `null` | **YES** | Sole fix target |

All regression products verified locally via `parsePurchaseStructureFromText` replay (2026-06-24).

---

## 7. Blast Radius — VL Rows That Would Change

| Metric | Value |
|--------|-------|
| Total VL `invoice_items` | 52 |
| Rows with parser output change | **1** |
| Ingredient affected | Ovo classe M (`9f167402-…`) |
| Invoice item | `480e66ee-dbee-4e2a-ac78-dc13a0f9fd63` |

**Expected:** exactly 1 row. Coverage audit (`.tmp/countable-multiplier-coverage-audit/`) confirms no other `dozen_countable` or `container_dot_count` failures in VL.

---

## 8. Validation Plan

### Phase 1 — Parser unit tests (`stock-normalization.test.ts`)

| Case | Input | Expected tier | Expected total |
|------|-------|---------------|----------------|
| VL primary | `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` | `caixa_dozen_count` | 180 `un` |
| Dot variant | `Ovo Classe M Cx.15 dúzias` | `caixa_dozen_count` | 180 `un` |
| Space variant | `Ovo Classe M cx 15 dúzias` | `caixa_dozen_count` | 180 `un` |
| Accentless | `Ovo Classe M Cx.15 duzias` | `caixa_dozen_count` | 180 `un` |
| English | `Eggs Class M cx 2 dozen` | `caixa_dozen_count` | 24 `un` |
| Negative | `Chocolate 10x200g` | `count_size` (unchanged) | 2000 `g` |
| Negative | `Caixa 40 un x 180g` | `caixa_units_size` (unchanged) | 7200 `g` |

### Phase 2 — Persistence replay

Replay `.tmp/ovo-countable-root-cause-audit/audit.mts` against local pipeline after implementation:

| Field | Before | After |
|-------|--------|-------|
| `parsePurchaseStructureFromText` | `null` | `totalUsableAmount: 180` |
| `recipeOperationalCostFieldsFromInvoiceLine.purchase_quantity` | 1 | 180 |
| `operationalCostFieldsFromInvoiceLine.cost_base_unit` | `un` | `un` |
| `resolveUnitsPerPack` | `null` | 15 (inner dozen count — not used for costing) |
| `effectiveIngredientUnitCostEur` | 38.44 | 0.2136 |

### Phase 3 — Recipe costing replay

```typescript
const fields = recipeOperationalCostFieldsFromInvoiceLine({
  name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
  quantity: 1, unit: "cx", unit_price: 38.44,
});
// ingredientLineCostEur(1, fields, { recipeUnit: "un" }) ≈ 0.2136
// ingredientLineCostEur(12, fields, { recipeUnit: "un" }) ≈ 2.5627
```

### Phase 4 — Regression sweep

Run `.tmp/countable-multiplier-coverage-audit/replay.mts` — expect `brokenCount: 0`, all controls unchanged.

### Phase 5 — Post-deploy persistence verification (out of design scope)

Re-ingest or backfill ingredient `9f167402-…` only after parser ships; compare DB `purchase_quantity` 1 → 180.

---

## Recommended Regex / Gate Pseudocode (Option A)

```typescript
const EGGS_PER_DOZEN = 12;

const DOZEN_UNIT_TOKEN = String.raw`dúzia|dúzias|duzia|duzias|dozen|dozens|dz`;

// Handles Cx.15 / cx 15 / CX.15 — optional dot after cx
const CAIXA_DOZEN_RE = new RegExp(
  String.raw`\b(?:caixa|caixas|cx)\s*\.?\s*(?<inner>\d+(?:[.,]\d+)?)\s*(?<dozenUnit>${DOZEN_UNIT_TOKEN})\b`,
  "iu",
);

// Optional Phase 2 — bare dozen without cx prefix (not required for VL fix)
const BARE_DOZEN_RE = new RegExp(
  String.raw`\b(?<inner>\d+(?:[.,]\d+)?)\s*(?<dozenUnit>${DOZEN_UNIT_TOKEN})\b`,
  "iu",
);

function scoreDozenMatch(match: RegExpMatchArray): number {
  const dozenCount = parseQuantityToken(match.groups?.inner ?? "");
  return dozenCount ?? -1;  // prefer larger dozen counts if multiple matches
}

// Gate: insert in parsePurchaseStructureFromText after caixa_compact_size
const caixaDozen = findBestRegexMatch(trimmed, CAIXA_DOZEN_RE, scoreDozenMatch);
if (caixaDozen?.groups) {
  const dozenCount = parseQuantityToken(caixaDozen.groups.inner ?? "");
  if (dozenCount != null) {
    const structure = buildStructure({
      purchaseQuantity: 1,
      purchaseFormat: "case",
      innerUnitCount: dozenCount,
      innerUnitType: "dozen",
      unitSize: EGGS_PER_DOZEN,
      unitMeasurement: "un",
      matchedText: caixaDozen[0] ?? trimmed,
      tier: "caixa_dozen_count",
    });
    logPurchaseStructureParse(trimmed, structure, "caixa_dozen_count");
    return structure;
  }
}
```

### Safety gates (recommended, not all required for VL)

1. **Dozen unit token required** — `dúzias` / `dz` / `dozen` must be present (blocks bare `Cx.15`).
2. **Optional egg noun** — `if (!/\b(ovo|ovos|egg|eggs)\b/iu.test(trimmed)) return null` — extra guard for non-VL corpora; **omit for VL minimal fix** since dozen token is already rare.
3. **Do NOT** extend `CAIXA_COUNT_ONLY_RE` with dot fix alone — still requires `findEmbeddedPieceMeasure` (g/ml), useless for eggs.

### Type change required

Extend `PurchaseStructure["tier"]` union with `"caixa_dozen_count"` (and `"bare_dozen_count"` if Phase 2 added).

---

## Evidence Sources

| Artifact | Path |
|----------|------|
| Root cause audit | `.tmp/ovo-countable-root-cause-audit/REPORT.md` |
| Coverage audit | `.tmp/countable-multiplier-coverage-audit/REPORT.md` |
| Parser implementation | `src/lib/stock-normalization.ts` |
| Costing path | `src/lib/invoice-purchase-price-semantics.ts` |
| Persistence path | `src/lib/ingredient-auto-persist.ts` |
| Recipe formula | `src/lib/recipe-prep-cost.ts`, `src/lib/usable-unit-conversion.ts` |

---

## Implementation Scope Summary

| Layer | Change? |
|-------|---------|
| `parsePurchaseStructureFromText` | **YES** — new `caixa_dozen_count` tier |
| `PurchaseStructure["tier"]` type | **YES** — add tier literal |
| `stock-normalization.test.ts` | **YES** — Ovo + regression cases |
| `invoice-purchase-price-semantics.ts` | **NO** |
| `ingredient-auto-persist.ts` | **NO** |
| `recipe-prep-cost.ts` | **NO** |
| DB / deployments | **NO** (design only) |
