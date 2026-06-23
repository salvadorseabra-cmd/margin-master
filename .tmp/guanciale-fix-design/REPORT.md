# Guanciale Fix — Implementation Design (DESIGN ONLY)

**Generated:** 2026-06-23  
**Mode:** STRICT IMPLEMENTATION DESIGN — no code changes, no DB writes, no deployments  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Confirmed bug:** Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino  
**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Invoice item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Ingredient:** Guanciale stagionato (`705dbbff-cd36-4dd6-9e68-bd68d350b9a6`)

---

## Executive Summary

Guanciale is a **downstream stock-normalization over-count**: extraction is correct (qty=5.996, €10.83/unit, €64.93 total), but `SIZE_COUNT_RE` matches `1,5kg*7` and `structureTotalIsFinalForGenericRow` locks usable at **10.5 kg** (7 × 1.5 kg case fiction) instead of **~5.996 kg** billed weight, understating operational cost **~43%** (€6.18/kg vs €10.83/kg).

Commercial reality is **A — Proven** (`.tmp/guanciale-commercial-reality-audit/`): row qty is billed kilograms; `*7` is supplier case metadata only.

**Recommended minimal fix:** Add a narrow `size_count` **weight-billed row** exception in `computeUsableFromPurchaseStructure` (and aligned purchase-count handling in `resolveStructurePurchaseQuantity`) when pack token is kg-sized, row unit is generic `un`, row qty is **fractional**, and row mass in grams is **materially below** the structure's full-case total. This fixes Guanciale without touching Mozzarella g-scaling, Peroni (qty=inner), Pomodori/Rulo/Aceto (integer outer qty=1), Pellegrino (cl), Julienne (`bare_measure`), or Ginger Beer (`detectVolume` path).

**Overall design confidence:** **0.87**

---

## Task 1 — Fix Location

### Primary locus (earliest incorrect assignment)

| File | Function | Line Range | Responsibility |
|------|----------|------------|----------------|
| `src/lib/stock-normalization.ts` | `SIZE_COUNT_RE` | 241–244 | Regex matches `1,5kg*7` as size×count token |
| `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` | 725–743 | Assigns tier `size_count`, inner=7, size=1.5 kg |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` / `buildStructure` | 443–461, 578–614 | **First wrong structure total:** `1 × 7 × 1500 g = 10 500 g` |
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` | 1092–1106 | Policy gate — treats size_count inner total as final for generic `un` rows |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` | 1148–1175 | Returns `1` when final-policy triggers; blocks row weight 5.996 kg from usable |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` | 1307–1318 | **First wrong final usable:** assigns `structure.totalUsableAmount` (10 500 g) via `structure_total` |

### Exact code blocks

**Regex and parse (structure fiction originates here — not primary fix target):**

```241:244:src/lib/stock-normalization.ts
const SIZE_COUNT_RE = new RegExp(
  String.raw`\b(?<size>\d+(?:[.,]\d+)?)\s*(?<unit>${MEASURE_UNIT_TOKEN})\s*${MULTIPLIER_SEP}\s*(?<inner>\d+(?:[.,]\d+)?)\s*(?<innerUnit>${GENERIC_INNER_UNIT_TOKEN})?\b`,
  "iu",
);
```

```725:743:src/lib/stock-normalization.ts
  const sizeCount = findBestRegexMatch(trimmed, SIZE_COUNT_RE, scoreSizeCountMatch);
  if (sizeCount?.groups) {
    const innerUnitCount = parseQuantityToken(sizeCount.groups.inner ?? "");
    const { unitSize, unitMeasurement } = parseSizeAndUnit(sizeCount.groups.size, sizeCount.groups.unit);
    // ...
    const structure = buildInnerUnitsStructure({
      innerUnitCount,
      // ...
      tier: "size_count",
    });
```

**Structure total computation (parse-time fiction):**

```578:614:src/lib/stock-normalization.ts
function buildStructure(params: {
  // ...
}): PurchaseStructure {
  const perItem = measureToBase(params.unitSize, params.unitMeasurement);
  const inner = params.innerUnitCount ?? 1;
  const rawTotal = params.purchaseQuantity * inner * perItem.amount;
  const totalUsableAmount = Math.max(1, Math.round(rawTotal));
  // ...
}
```

**Policy gate blocking row weight:**

```1092:1106:src/lib/stock-normalization.ts
function structureTotalIsFinalForGenericRow(
  structure: PurchaseStructure,
  rowUnit: string | null,
): boolean {
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (structure.tier === "count_size" || structure.tier === "units_size") {
    return true;
  }
  const hasInner = (structure.innerUnitCount ?? 1) > 1;
  return (
    hasInner ||
    structure.tier === "caixa_units_size" ||
    structure.tier === "caixa_compact_size"
  );
}
```

**Wrong usable assignment (primary fix integration point):**

```1303:1318:src/lib/stock-normalization.ts
    } else if (shouldScaleOuterPackForSizeCountGenericRow(structure, rowQuantity, rowUnit)) {
      total = scaleStructureTotal(structure, purchaseContainerCount);
      usableSource = "structure_scaled_outer";
      // ...
    } else if (
      rowConflatedInner ||
      purchaseContainerCount === structure.purchaseQuantity ||
      structureTotalIsFinalForGenericRow(structure, rowUnit)
    ) {
      total = structure.totalUsableAmount;
      usableSource = "structure_total";
      // ...
        fallbackReason = "name N×SIZE total is final; generic row does not rescale inner pack";
```

### Supporting context (correct, not fix target)

| File | Function | Line Range | Role |
|------|----------|------------|------|
| `src/lib/stock-normalization.ts` | `shouldScaleOuterPackForSizeCountGenericRow` | 1112–1123 | Mozzarella g-only outer scaling — **does not fire** on Guanciale (kg pack) |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat` | — | Passes row qty=5.996 — not the bug |
| `src/lib/invoice-purchase-price-semantics.ts` | `computeEffectiveUsableCost` | — | Amplifies wrong usable (64.93 ÷ 10.5 kg → €6.18/kg); self-corrects once usable fixed |
| `supabase/functions/extract-invoice/*` | — | — | Stages 1–7 proven correct; out of scope |

### Test harness (implementation companion)

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/stock-normalization.test.ts` | Guanciale VL case + SIZE_COUNT kg/count regression matrix | Lock fix and guard controls |

---

## Task 2 — Current Flow

### Pipeline: Invoice qty → purchase structure → usable

```
invoice_items
  qty=5.996, unit=un, unit_price=10.83, total=64.93
  name="Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino"
        │
        ▼
resolveInvoiceLinePurchaseFormat()          invoice-purchase-format.ts
        │
        ▼
normalizePurchasedToUsableStock()           stock-normalization.ts
        │
        ├─ parsePurchaseStructureFromText()  stock-normalization.ts:725
        │     SIZE_COUNT_RE matches "1,5kg*7"
        │     tier: size_count
        │     innerUnitCount: 7, unitSize: 1.5 kg
        │     purchaseQuantity: 1 (via buildInnerUnitsStructure)
        │     totalUsableAmount: 10 500 g  ✗ full-case fiction (7×1.5 kg)
        │
        └─ computeUsableFromPurchaseStructure(structure, rowQty=5.996, rowUnit="un")
              │
              ├─ resolveStructurePurchaseQuantity()
              │     shouldScaleOuterPackForSizeCountGenericRow() → false (kg pack)
              │     structureTotalIsFinalForGenericRow() → true
              │     purchaseContainerCount → 1  ✗ row weight 5.996 kg discarded
              │
              └─ branch: structureTotalIsFinalForGenericRow → true
                    total = structure.totalUsableAmount = 10 500 g  ✗ should be 5 996 g
                    usableSource = "structure_total"
                    fallbackReason = "name N×SIZE total is final; generic row does not rescale inner pack"
        │
        ▼
structuredFromExplicitPhrase()
  kind: multi_unit_pack
  purchaseContainerCount: 7  ✗ implies 7 purchased units
  normalizedUsableQuantity: 10 500 g
        │
        ▼
computeEffectiveUsableCost()
  64.93 ÷ 10.5 kg → €6.18/kg  ✗ should be €10.83/kg
```

### Where billed weight is discarded

| Step | Input | Output | Expected | Status |
|------|-------|--------|----------|--------|
| Extraction (stages 1–7) | PDF 5.996 kg | qty=5.996 persisted | 5.996 | ✓ |
| `parsePurchaseStructureFromText` | `1,5kg*7` | 10 500 g structure total | metadata only | ✗ fiction at parse |
| `resolveStructurePurchaseQuantity` | rowQty=5.996, inner=7 | **1** | use row as billed kg | ✗ **weight discarded here** |
| `computeUsableFromPurchaseStructure` | structureTotal=10 500 g | **10 500 g** | **5 996 g** | ✗ **wrong value assigned here** |
| Operational cost (downstream) | usable=10 500 g | €6.18/kg | €10.83/kg | ✗ consequence |

### Why the policy misfires on Guanciale

`structureTotalIsFinalForGenericRow` correctly prevents double-scaling on count-priced lines (Peroni qty=24 bottles = `33cl*24` total; Rulo qty=1 outer = `1kg*2` total). On Guanciale, invoice **Qtd = 5.996** is **billed kilograms** (proven by €64.93 discount math), while `*7` encodes the **standard full-case shape** (7 × ~1.5 kg ≈ 10.5 kg) — supplier metadata, not purchased units on this line.

**Control on same invoice:** Mozzarella Julienne `3kg`, qty=10 uses `bare_measure` tier → 30 000 g ✓. Peroni `33cl*24`, qty=24 → 7 920 ml ✓. Proves pipeline handles count-priced lines; Guanciale is the only weight-priced fractional `SIZE_COUNT_RE` line on this invoice.

---

## Task 3 — Fix Options

| Option | Location | Scope | Risk |
|--------|----------|-------|------|
| **A — `size_count` weight-billed row exception (recommended)** | New helper + `computeUsableFromPurchaseStructure` (~1303) + `resolveStructurePurchaseQuantity` (~1171) | `size_count` + kg pack + generic row + fractional qty + row mass < structure total | **Low** — VL partition: Guanciale-only fractional qty among kg SIZE_COUNT rows |
| **B — Narrow `structureTotalIsFinalForGenericRow`** | 1092–1106 — add `rowQuantity` param + weight-billed predicate | Centralized policy gate | **Low–medium** — signature change; all callers must pass rowQty |
| **C — Always scale generic row for all `size_count`** | Remove final-policy for `size_count` | All size_count generic rows | **High** — breaks Peroni; **worsens** Guanciale (6×10.5 kg if scaled by row qty) |
| **D — Outer-multiply row qty on kg `size_count`** | `scaleStructureTotal(structure, rowQty)` | kg size_count when rowQty ≠ inner | **High** — Guanciale → 63 000 g (5.996×10.5 kg fiction); wrong direction |
| **E — Parse-time skip / downgrade `*N` for `+/-` tolerance names** | `parsePurchaseStructureFromText` | Name-pattern band-aid | **Medium** — brittle; name-specific; no row qty at parse |
| **F — Fix in `invoice-purchase-format.ts` only** | Override `normalizedUsableQuantity` | Downstream only | **Medium** — core contract unchanged; test replays miss it |
| **G — Fix in `invoice-purchase-price-semantics.ts` only** | Op cost divide only | Price semantics | **Unacceptable** — usable stock UI stays 10.5 kg |
| **H — Reuse Mozzarella `shouldScaleOuterPackForSizeCountGenericRow`** | 1112–1123 | g-only outer scaling | **Unacceptable** — explicitly excludes kg; wrong direction for Guanciale |

---

## Task 4 — Regression Analysis

Expected behaviour **after Option A** (recommended minimal fix):

| Product | Tier | Invoice qty | Current usable | After Option A | Op cost | Must preserve? |
|---------|------|------------:|---------------:|---------------:|---------|:--------------:|
| **Guanciale 1,5kg*7** | `size_count` | 5.996 | 10.5 kg | **~5.996 kg** | **€10.83/kg** | Fix target |
| **Birra Peroni 33cl*24** | `size_count` | 24 (= inner) | 7.92 L | 7.92 L | €3.24/L | ✓ cl pack; not kg |
| **Aceto 5l*2** | `size_count` | 1 | 10 L | 10 L | €1.56/L | ✓ L pack; integer qty |
| **Rulo Di Capra 1kg*2** | `size_count` | 1 | 2 kg | 2 kg | €5.43/kg | ✓ integer outer qty |
| **POMODORI (CX 2,5KG*6)** | `size_count` | 1 | 15 kg | 15 kg | €1.47/kg | ✓ integer outer qty |
| **MOZZA Julienne 3kg** | `bare_measure` | 10 | 30 kg | 30 kg | €6.68/kg | ✓ different tier/path |
| **MOZZARELLA 125GR*8** | `size_count` | 10 | 1 kg (pre-Mozzarella fix) / 10 kg (post) | unchanged vs respective baseline | — | ✓ g pack excluded |
| **Baladin Ginger Beer 0.20cl** | volume inference | 24 | 48 ml (buggy) | unchanged | — | ✓ orthogonal `detectVolume` path |

### Per-option regression notes

| Option | Peroni | Aceto | Rulo | Pomodori | Julienne | Mozzarella g | Ginger Beer | Guanciale |
|--------|:------:|:-----:|:----:|:--------:|:--------:|:------------:|:-----------:|:---------:|
| **A (recommended)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **fix** |
| **B** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **fix** |
| **C** | **✗** over-scale | varies | **✗** | **✗** | ✓ | **✗** | ✓ | **✗ worse** |
| **D** | **✗** | **✗** | **✗** | **✗** | ✓ | **✗** | ✓ | **✗ 63 t** |
| **E–G** | varies | varies | varies | varies | varies | varies | varies | partial/unacceptable |
| **H** | ✓ | ✓ | ✓ | ✓ | ✓ | wrong track | ✓ | **✗ excluded** |

### VL discriminator evidence (Option A guards)

| Signal | Guanciale | Correct kg SIZE_COUNT (Pomodori, Rulo) | Correct non-kg (Peroni, Aceto) | Separates? |
|--------|:---------:|:--------------------------------------:|:------------------------------:|:----------:|
| `bound.qty` fractional | **5.996** | 1 (integer) | 24 / 1 (integer) | **Yes** |
| `unitMeasurement` | **kg** | kg | cl / L | Partial |
| `rowQty < innerUnitCount` | **5.996 < 7** | 1 < 6 (but integer qty) | n/a | With fractional guard |
| `rowMassGrams < structureTotal` | **5996 < 10500** | 1000 ≮ 15000 at qty=1 | n/a | With fractional guard |
| `shouldScaleOuterPackForSizeCountGenericRow` | **false** | false | false / true (Pellegrino) | No |
| `nameContainsTolerance (+/-)` | **true** | false | false | Guanciale-only (optional tighten) |

---

## Task 5 — Minimal Safe Option

### Choice: **Option A — `size_count` weight-billed row exception**

### Proposed helper (design pseudocode — not implementation)

```typescript
function hasFractionalQuantity(qty: number): boolean {
  return Math.abs(qty - Math.round(qty)) > 0.001;
}

function shouldUseRowQtyAsBilledKgForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (structure.unitMeasurement !== "kg") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 0) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false; // piece-count line (Peroni analog)
  if (!hasFractionalQuantity(rowQuantity)) return false; // count-priced outers: Pomodori, Rulo, Mezzi
  const rowMassGrams = measureToBase(rowQuantity, "kg").amount;
  if (rowMassGrams >= structure.totalUsableAmount * 0.99) return false; // full-case weight → keep structure
  return rowMassGrams < structure.totalUsableAmount; // partial billed weight vs case fiction
}
```

### Integration points

1. **`computeUsableFromPurchaseStructure` (~1303):** Insert **before** `shouldScaleOuterPackForSizeCountGenericRow` and `structure_total` branches:

   ```typescript
   } else if (shouldUseRowQtyAsBilledKgForSizeCountGenericRow(structure, rowQuantity, rowUnit)) {
     total = measureToBase(rowQuantity!, "kg").amount; // 5996 g for Guanciale
     usableSource = "row_weight_billed"; // new source label (or reuse structure_recomputed)
     fallbackReason = "size_count kg row qty is billed weight; *N case metadata not purchased mass";
   ```

2. **`resolveStructurePurchaseQuantity` (~1171):** When helper is true, return `1` (single weight purchase — **not** inner count 7). Ensures `purchaseContainerCount` does not imply 7 purchased units.

### Justification (fewest assumption changes)

| Criterion | Assessment |
|-----------|------------|
| Fixes earliest stage with row qty available | Yes — `computeUsableFromPurchaseStructure` + purchase count alignment |
| No parser / SIZE_COUNT_RE redesign | Yes — `1,5kg*7` parse stays; metadata preserved for display |
| No price-semantics change | Yes — 5996 g → €64.93 ÷ 5.996 kg = €10.83/kg automatically |
| Preserves Peroni | Yes — cl not kg |
| Preserves Pomodori / Rulo / Aceto | Yes — integer outer qty; no fractional guard fire |
| Preserves Mozzarella g-scaling | Yes — orthogonal helper; g-only path untouched |
| Preserves Julienne / Ginger Beer | Yes — bare_measure and volume paths untouched |
| VL isolation | Yes — 1/51 user-visible over-count; fractional qty Guanciale-only among SIZE_COUNT |
| Test surface | One helper + two call-site guards + regression matrix |

### Why not broader fixes

- **Option C/D** scale by row qty on all `size_count` — breaks Peroni or multiplies Guanciale fiction (63 000 g).
- **Option H (Mozzarella helper)** — g-only, under-count direction; explicitly excluded in source comment at 1108–1110.
- **Option G** — leaves usable UI wrong.
- **Option E (+/- name only)** — not evidence-backed for future SKUs without tolerance prefix.

### Optional tightening (single-exemplar residual risk)

If a future kg `size_count` line has fractional qty but count-priced semantics, add `nameContainsTolerance` or require `rowQuantity < innerUnitCount`. **Not required for VL** — no second Guanciale invoice; fractional+partial guard already unique.

### `purchaseContainerCount` semantics after fix

| Field | Current (wrong) | Expected after fix |
|-------|-----------------|-------------------|
| `normalizedUsableQuantity` | 10 500 g | **5 996 g** |
| `purchaseContainerCount` | 7 (from `*7`) | **1** (weight purchase; inner 7 is catalog metadata only) |
| `usableSource` | `structure_total` | **`row_weight_billed`** |

---

## Task 6 — Expected Results

**Re-ingest invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d`

| Metric | Current (wrong) | Expected after fix | Evidence |
|--------|-----------------|-------------------|----------|
| `normalizedUsableQuantity` | 10 500 g | **5 996 g** | commercial-reality audit; 5.996 × €10.83 ≈ €64.93 |
| Usable stock (UI) | 10.5 kg | **~6 kg** | replay.json |
| Operational cost (UI) | €6.18/kg | **€10.83/kg** | 64.93 ÷ 5.996 kg |
| `computeEffectiveUsableCost` | €6.18/kg | **€10.83/kg** | discriminator.json priceSemantics |
| Procurement cost (UI) | €10.83/unit | **€10.83/unit** (unchanged) | line unit_price correct |
| Invoice row qty / total | 5.996 / €64.93 | **unchanged** | stages 1–7 proven |
| Line total closure | €64.93 | **€64.93** | PDF MATCH |
| `purchaseContainerCount` | 7 | **1** | must not imply 7 purchased units |
| `usableSource` | `structure_total` | **`row_weight_billed`** | trace |
| 10.5 kg rejected path | implied net €113.72 | **N/A** | Δ +€48.79 vs PDF |

---

## Task 7 — Validation Matrix

### Must correct (Guanciale)

| # | Surface | Current | Expected | Check |
|---|---------|---------|----------|-------|
| 1 | Stock normalization replay | 10 500 g | **5 996 g** | `computeUsableFromPurchaseStructure` |
| 2 | `usableSource` | `structure_total` | **`row_weight_billed`** | trace |
| 3 | Ingredient detail usable | 10.5 kg | **~6 kg** | UI / replay.json |
| 4 | Operational cost | €6.18/kg | **€10.83/kg** | `computeEffectiveUsableCost` |
| 5 | `purchaseContainerCount` | 7 | **1** | structured output |
| 6 | Invoice row | qty=5.996, total=€64.93 | **unchanged** | VL DB |
| 7 | Procurement | €10.83/unit | **unchanged** | UI |

### Must not change (same invoice `36c99d19`)

| Product | qty | Usable | Op cost |
|---------|----:|-------:|--------:|
| Birra Peroni 33cl*24 | 24 | 7.92 L | €3.24/L |
| Aceto balsamico 5l*2 | 1 | 10 L | €1.56/L |
| Rulo Di Capra 1kg*2 | 1 | 2 kg | €5.43/kg |
| MOZZA Julienne 3kg | 10 | 30 kg | €6.68/kg |
| Farina Amoruso 25kg | 1 | 25 kg | (weight line, non-SIZE_COUNT) |

### Must not change (cross-invoice)

| Product | Invoice | Usable | Op cost |
|---------|---------|-------:|--------:|
| POMODORI PELATI (CX 2,5KG*6) | f0aa5a08 | 15 kg | €1.47/kg |
| MOZZARELLA 125GR*8 | f0aa5a08 | baseline per Mozzarella fix state | — |
| ACQUA S.PELLEGRINO (CX 75CL*15) | f0aa5a08 | 11.25 L | €3.73/L |
| SanPellegrino 75cl x 15ud | ab52796d | 11.25 L | €3.43/L |
| Baladin Ginger Beer 0.20cl | ab52796d | 48 ml (pre-Ginger fix baseline) | orthogonal path |

### Automated tests to add (implementation phase)

```typescript
// Guanciale VL case
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino')!,
  5.996,
  'un',
) → { usableQuantity: 5996, usableSource: 'row_weight_billed', purchaseContainerCount: 1 }

// Pomodori kg control (integer outer qty)
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('POMODORI PELATI (CX 2,5KG*6)')!,
  1,
  'un',
) → { usableQuantity: 15000, usableSource: 'structure_total' }

// Peroni control
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('Birra Peroni 33cl*24')!,
  24,
  'un',
) → { usableQuantity: 7920, usableSource: 'structure_total' }

// Rulo kg control
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('Rulo Di Capra 1kg*2')!,
  1,
  'un',
) → { usableQuantity: 2000, usableSource: 'structure_total' }
```

### Manual checklist

- [ ] Invoice `36c99d19` Guanciale row: qty=5.996, €10.83/unit, €64.93 total unchanged
- [ ] Ingredient detail: **~6 kg usable**, **€10.83/kg** operational
- [ ] Sibling lines unchanged (Peroni, Aceto, Julienne, Rulo, Farina)
- [ ] Re-ingest `36c99d19` via `syncOperationalIngredientCostsFromInvoiceLines`
- [ ] Mozzarella coupling: if Mozzarella fix present, Guanciale fix must not alter Mozzarella g-scaling
- [ ] Full VL 51-row replay: no new user-visible regressions

### Frozen baselines

| Artifact | Use |
|----------|-----|
| `.tmp/guanciale-commercial-reality-audit/verdict.json` | Commercial truth A-Proven |
| `.tmp/guanciale-implementation-prep/readiness.json` | Pipeline trace, value trace |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | UI + math baselines |
| `.tmp/size-count-discriminator-audit/discriminator.json` | VL partition evidence |
| `.tmp/stock-normalization-family-assessment/assessment.json` | Mozzarella vs Guanciale causal split |
| `.tmp/mozzarella-fix-design/design.json` | Negative control specification |

---

## Task 8 — Readiness A/B/C

| Criterion | Before design | After design | Class |
|-----------|---------------|--------------|:-----:|
| Root cause localized to function + stage | A — Proven | A — Proven | **A** |
| Extraction ruled out (stages 1–7) | A — Proven | A — Proven | **A** |
| Commercial reality (purchased mass) | A — Proven (dedicated audit) | A — Proven | **A** |
| Live replay matches persisted | A — Proven | A — Proven | **A** |
| Isolation (user-visible over-count) | A — Proven (1/51) | A — Proven | **A** |
| Mozzarella decoupling understood | A — Proven | A — Proven (orthogonal helpers) | **A** |
| Implementation prep artifact | A — Proven | A — Proven | **A** |
| **Fix design artifact** | **C — Missing** | **A — This document** | **A** |
| **Runtime fix discriminator** | **C — Missing** | **A — Option A guard proven on VL matrix** | **A** |
| Change surface mapped | A — Proven | A — Proven | **A** |
| Regression controls identified | B — Listed, not post-design validated | B — Matrix specified; execution pending implementation | **B** |
| Re-ingest path | B — Needs validation | B — Plan documented for `36c99d19` | **B** |
| Price-history follow-on | B — Stale history signal | B — Post-fix validation required | **B** |
| Single VL exemplar | B — No second Guanciale invoice | B — Residual; fractional+partial guard unique in VL | **B** |
| Implementation validation replay | C — Missing | B — Planned in Task 7 | **B** |

### Ready for implementation?

**Yes — for scoped stock-normalization fix**, at the same bar as `.tmp/mozzarella-fix-design/` before code change.

**Preconditions for code change:**

1. Implement Option A helper + two integration points only.
2. Do **not** modify `SIZE_COUNT_RE`, `buildStructure`, or Mozzarella g-scaling helper.
3. Run frozen regression matrix (Task 7) before merge.
4. Re-ingest `36c99d19` after merge.
5. Treat price-history as follow-on, not blocking usable correction.

**Not ready for:** deployment or DB writes until implementation + validation replay complete.

---

## Confidence

| Area | Score | Rationale |
|------|------:|-----------|
| Root cause / fix location | **0.94** | Stage 8 trace; exact functions verified in source |
| Commercial reality alignment | **0.94** | A-Proven monetary closure at 5.996 kg |
| Minimal option safety | **0.85** | VL partition strong; single exemplar + integer/fractional guard |
| Downstream self-correction | **0.91** | Price-semantics math: 5996 g → €10.83/kg without code change |
| Regression preservation | **0.86** | kg fractional guard separates Guanciale from Pomodori/Rulo; Mozzarella orthogonal |
| **Overall design confidence** | **0.87** | Ready for implementation with frozen regression matrix |

---

## Sources

| Artifact | Use |
|----------|-----|
| `.tmp/guanciale-commercial-reality-audit/` | A-Proven commercial truth; monetary reconciliation |
| `.tmp/guanciale-implementation-prep/` | Pipeline trace, change surface, value trace |
| `.tmp/guanciale-readiness-audit/` | Prior blocker inventory |
| `.tmp/stock-normalization-family-assessment/` | Mozzarella vs Guanciale causal comparison |
| `.tmp/size-count-discriminator-audit/` | VL partition signals; helper fire matrix |
| `.tmp/mozzarella-fix-design/` | Design benchmark; negative controls |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | UI + math baselines |
| `src/lib/stock-normalization.ts` | Primary fix locus (lines cited above) |
