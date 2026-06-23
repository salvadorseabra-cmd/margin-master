# Mozzarella Fix — Implementation Design (DESIGN ONLY)

**Generated:** 2026-06-22  
**Mode:** STRICT IMPLEMENTATION DESIGN — no code changes, no DB writes, no deployments  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Confirmed bug:** MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968`  
**Invoice item:** `095b2bb9-bd36-44c2-a1f9-7c50fa9c0cc6`

---

## Executive Summary

Mozzarella is a **downstream stock-normalization under-count**: extraction is correct (qty=10, €8.12/unit, €81.23 total), but `structureTotalIsFinalForGenericRow` blocks invoice outer-pack scaling for `size_count` tier (`125GR*8`), freezing usable at **1 kg** instead of **10 kg** and inflating operational cost **10×** (€81.20/kg vs €8.12/kg).

**Recommended minimal fix:** Add a narrow `size_count` outer-pack scaling exception in `resolveStructurePurchaseQuantity` and `computeUsableFromPurchaseStructure` when generic row qty differs from inner count and pack size is sub-kg (g/ml/cl). This fixes Mozzarella without touching Guanciale (kg pack), Peroni (qty=inner), S.Pellegrino (caixa tier), Stracciatella (bare_measure), or Family A (Mezzi/Ricotta).

**Overall design confidence:** **0.89**

---

## Task 1 — Fix Location

### Primary locus (earliest incorrect assignment)

| File | Function | Line Range | Exact code block |
|------|----------|------------|------------------|
| `src/lib/stock-normalization.ts` | `structureTotalIsFinalForGenericRow` | 1087–1100 | Policy gate returning `true` for any `size_count` with `innerUnitCount > 1` on generic row units |
| `src/lib/stock-normalization.ts` | `resolveStructurePurchaseQuantity` | 1149–1150 | Returns `1` when policy gate is true — **invoice qty 10 discarded** |
| `src/lib/stock-normalization.ts` | `computeUsableFromPurchaseStructure` | 1278–1288 | Assigns `structure.totalUsableAmount` (1000 g) with fallback `"name N×SIZE total is final; generic row does not rescale inner pack"` |

### Exact code blocks

**Policy gate (`structureTotalIsFinalForGenericRow`):**

```1087:1100:src/lib/stock-normalization.ts
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

**Purchase count collapse (`resolveStructurePurchaseQuantity`):**

```1149:1150:src/lib/stock-normalization.ts
    if (isGenericPurchaseUnit(rowUnit)) {
      return structureTotalIsFinalForGenericRow(structure, rowUnit) ? 1 : Math.max(1, Math.round(rowQuantity));
```

**Wrong usable assignment (`computeUsableFromPurchaseStructure`):**

```1278:1288:src/lib/stock-normalization.ts
    } else if (
      rowConflatedInner ||
      purchaseContainerCount === structure.purchaseQuantity ||
      structureTotalIsFinalForGenericRow(structure, rowUnit)
    ) {
      total = structure.totalUsableAmount;
      usableSource = "structure_total";
      if (rowConflatedInner) {
        fallbackReason = "row qty conflated with inner count; ignored row g/ml";
      } else if (structureTotalIsFinalForGenericRow(structure, rowUnit)) {
        fallbackReason = "name N×SIZE total is final; generic row does not rescale inner pack";
```

### Supporting context (correct, not fix target)

| File | Function | Line Range | Role |
|------|----------|------------|------|
| `src/lib/stock-normalization.ts` | `parsePurchaseStructureFromText` | 720–738 | Correctly parses `125GR*8` → tier `size_count`, inner=8, size=125 g, total=1000 g **per outer pack** |
| `src/lib/stock-normalization.ts` | `buildInnerUnitsStructure` | 442–460 | Sets `purchaseQuantity: 1` (single-pack semantics — intentional) |
| `src/lib/stock-normalization.ts` | `normalizePurchasedToUsableStock` | 1787–1789 | Orchestration entry; calls `computeUsableFromPurchaseStructure` |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoiceLinePurchaseFormat` | 655–680 | Passes row qty=10 into stock normalization — not the bug |
| `src/lib/invoice-purchase-price-semantics.ts` | `resolveOperationalUsablePerPricedUnit` | 453–476 | **Amplifies** wrong usable (1000÷10 → 100 g/priced unit → €81.20/kg); self-corrects once usable is fixed |

### Test harness (implementation companion, not runtime fix)

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/stock-normalization.test.ts` | Add Mozzarella VL case + regression matrix | Lock fix and guard controls |

---

## Task 2 — Current Flow

### Pipeline: Invoice qty → purchase structure → usable

```
invoice_items
  qty=10, unit=un, unit_price=8.12, total=81.23
  name="MOZZARELLA FIOR DI LATTE \"IL BOCCONCINO\" 125GR*8"
        │
        ▼
resolveInvoiceLinePurchaseFormat()          invoice-purchase-format.ts:655
        │
        ▼
normalizePurchasedToUsableStock()           stock-normalization.ts:1776
        │
        ├─ parsePurchaseStructureFromText()  stock-normalization.ts:720
        │     SIZE_COUNT_RE matches "125GR*8"
        │     tier: size_count
        │     innerUnitCount: 8, unitSize: 125 g
        │     purchaseQuantity: 1 (via buildInnerUnitsStructure)
        │     totalUsableAmount: 1000 g  ✓ per outer pack
        │
        └─ computeUsableFromPurchaseStructure(structure, rowQty=10, rowUnit="un")
              │
              ├─ resolveStructurePurchaseQuantity()
              │     structureTotalIsFinalForGenericRow() → true
              │     (hasInner=true, tier=size_count, generic "un")
              │     purchaseContainerCount → 1  ✗ should be 10
              │
              └─ branch: structureTotalIsFinalForGenericRow → true
                    total = structure.totalUsableAmount = 1000 g  ✗ should be 10000 g
                    usableSource = "structure_total"
                    fallbackReason = "name N×SIZE total is final; generic row does not rescale inner pack"
        │
        ▼
structuredFromExplicitPhrase()
  kind: multi_unit_pack
  purchaseContainerCount: 8 (inner balls — display metadata)
  normalizedUsableQuantity: 1000 g
        │
        ▼
recipeOperationalCostFieldsFromInvoiceLine()
  resolveOperationalUsablePerPricedUnit()
    totalUsable=1000, singleUnit replay also 1000 → divides by rowQty 10
    → 100 g per priced unit → computeEffectiveUsableCost → €81.20/kg
```

### Where scaling is lost

| Step | Input | Output | Expected | Status |
|------|-------|--------|----------|--------|
| Extraction (stages 1–7) | PDF 10 packs | qty=10 persisted | 10 | ✓ |
| `parsePurchaseStructureFromText` | `125GR*8` | 1000 g per pack | 1000 g per pack | ✓ |
| `resolveStructurePurchaseQuantity` | rowQty=10, inner=8 | **1** | **10** | ✗ **scaling lost here** |
| `computeUsableFromPurchaseStructure` | purchaseContainerCount=1 | **1000 g** | **10000 g** | ✗ **wrong value assigned here** |
| Operational cost (downstream) | usable=1000 g | €81.20/kg | €8.12/kg | ✗ consequence |

### Why the policy exists (and why it misfires on Mozzarella)

`structureTotalIsFinalForGenericRow` was designed to prevent double-scaling when the product name already encodes a full N×SIZE total (e.g. Peroni `33cl*24` with qty=24 bottles, or weak OCR rows where row qty conflates with inner count). For Mozzarella, the name encodes **one outer pack** (8×125 g = 1 kg), but invoice qty=10 means **10 outer packs** — a layer the policy does not distinguish.

**Control on same invoice:** Stracciatella `250 GR`, qty=24 uses `bare_measure` tier → `structure_recomputed` path → 24×250 g = 6000 g ✓. Proves the pipeline scales by row qty when the final-policy gate does not block.

---

## Task 3 — Fix Options

| Option | Location | Scope | Risk |
|--------|----------|-------|------|
| **A — `size_count` outer-pack exception (recommended)** | New helper + `resolveStructurePurchaseQuantity` (1149–1150) + `computeUsableFromPurchaseStructure` (1278–1294) | `size_count` tier only; generic row; rowQty ≠ innerCount; unitMeasurement ∉ {kg, L} | **Low** — targeted; preserves Peroni (qty=inner), Guanciale (kg), caixa tiers |
| **B — Narrow `structureTotalIsFinalForGenericRow`** | `structureTotalIsFinalForGenericRow` (1087–1100) — add `rowQuantity` param | Same predicate as A but centralized in policy gate | **Low–medium** — signature change; all callers must pass rowQty; easier to miss a call site |
| **C — Always scale generic row for `size_count`** | Remove `size_count` from final-policy in `structureTotalIsFinalForGenericRow` | All `size_count` + generic rows | **High** — breaks Peroni when qty=inner; may affect Guanciale direction |
| **D — Change `buildInnerUnitsStructure` purchaseQuantity** | `buildInnerUnitsStructure` (442–460) | Parser output | **High** — parse-time has no row qty; would break single-unit replays used by price semantics |
| **E — Post-multiply in `normalizePurchasedToUsableStock`** | After line 1789 | Band-aid at orchestration layer | **Medium** — duplicates scaling logic; bypasses `purchaseContainerCount` consistency |
| **F — Fix in `invoice-purchase-format.ts` only** | `resolveInvoiceLinePurchaseFormat` / `structuredFromExplicitPhrase` | Downstream override | **Medium** — fixes structured output but not core `computeUsableFromPurchaseStructure` contract; test harness replays miss it |
| **G — Fix in `invoice-purchase-price-semantics.ts` only** | `resolveOperationalUsablePerPricedUnit` | Op cost only | **Unacceptable** — usable stock UI stays at 1 kg; recipe denominator unchanged |
| **H — Guanciale-combined policy rewrite** | Full `size_count` family redesign | Both Mozzarella + Guanciale | **Out of scope** — user constraint: do not redesign stock normalization |

---

## Task 4 — Regression Analysis

Expected behaviour **after Option A** (recommended minimal fix):

| Product | Tier | Invoice qty | Current usable | After fix | Op cost | Must preserve? |
|---------|------|------------:|---------------:|----------:|---------|:--------------:|
| **Mozzarella 125GR*8** | `size_count` | 10 | 1 kg | **10 kg** | **€8.12/kg** | Fix target |
| **Stracciatella 250 GR** | `bare_measure` | 24 | 6 kg | 6 kg | €12.44/kg | ✓ unchanged (different tier/path) |
| **Birra Peroni 33cl*24** | `size_count` | 24 (= inner) | 7.92 L | 7.92 L | €3.24/L | ✓ qty=inner → no scale |
| **ACQUA S.PELLEGRINO (CX 75CL*15)** | `caixa_units_size` | 2 | 11.25 L | 11.25 L | €3.73/L | ✓ different tier |
| **SanPellegrino 75cl x 15ud** | `size_count` | 2 | 11.25 L (UI correct) | 11.25 L | correct | ✓ verify: qty≠inner but op already correct via price-semantics compensator; scaling 2× may need price-semantics check — **run matrix before merge** |
| **Guanciale 1,5kg*7** | `size_count` | 5.996 | 10.5 kg | 10.5 kg | €6.18/kg | ✓ kg pack excluded from exception |
| **Mezzi (CX 1KG*6)** | `caixa_units_size` | 2 | 6 kg | 6 kg | €4.55/kg | ✓ Family A separate; tier untouched |
| **Ricotta 1,5KG** | no SIZE×COUNT | 2 | 3 kg | 3 kg | €2.66/kg | ✓ Family A; bare/kg path |

### Per-option regression notes

| Option | Stracciatella | Peroni | S.Pellegrino | Guanciale | Mezzi | Ricotta |
|--------|:-------------:|:------:|:------------:|:---------:|:-----:|:-------:|
| **A (recommended)** | ✓ | ✓ | ✓ (verify SanPellegrino qty=2) | ✓ | ✓ | ✓ |
| **B** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **C** | ✓ | **✗ risk** (24×7920 ml) | varies | **✗ worse** (6×10500 g) | ✓ | ✓ |
| **D–G** | varies | varies | varies | varies | varies | varies |
| **H** | ✓ | ✓ | ✓ | fix | ✓ | ✓ |

### SanPellegrino caveat

SanPellegrino `75cl x 15ud` (qty=2) shares `size_count` structurally but UI economics are already correct. Option A would scale usable 11250→22500 ml. Price-semantics may already compensate via `resolveOperationalUsablePerPricedUnit`; **validation must confirm op €/L unchanged** on both S.Pellegrino rows before merge. If op regresses, tighten exception with additional guard (e.g. require `unitMeasurement === "g"` or `"gr"` only, which covers Mozzarella and excludes cl-based beverages).

---

## Task 5 — Minimal Safe Option

### Choice: **Option A — `size_count` outer-pack scaling exception**

### Proposed helper (design pseudocode — not implementation)

```typescript
function shouldScaleOuterPackForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || rowQuantity <= 1) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false; // Peroni: qty matches inner bottle count
  if (structure.unitMeasurement === "kg" || structure.unitMeasurement === "L") return false; // Guanciale
  return true;
}
```

### Integration points

1. **`resolveStructurePurchaseQuantity` (1149–1150):** When `shouldScaleOuterPackForSizeCountGenericRow` is true, return `Math.max(1, Math.round(rowQuantity))` even if `structureTotalIsFinalForGenericRow` is true.

2. **`computeUsableFromPurchaseStructure` (1278–1294):** When helper is true, take the `else` branch → `scaleStructureTotal(structure, purchaseContainerCount)` → `1000 × 10 = 10000 g`, `usableSource: structure_scaled_outer`.

### Justification (fewest assumption changes)

| Criterion | Assessment |
|-----------|------------|
| Fixes earliest incorrect stage | Yes — same functions where scaling is lost |
| No parser redesign | Yes — `125GR*8` parse stays correct |
| No price-semantics change | Yes — downstream self-corrects when usable=10000 g |
| Preserves Peroni | Yes — rowQty=24=inner → helper false |
| Preserves Guanciale | Yes — unitMeasurement=kg → helper false |
| Preserves caixa / bare tiers | Yes — helper limited to `size_count` |
| Preserves Family A | Yes — Mezzi uses `caixa_units_size`; Ricotta uses bare/kg |
| Test surface | One helper + two call-site guards + one VL regression test |

### Why not broader fixes

- **Option C** (remove final-policy for all `size_count`) breaks Peroni and worsens Guanciale.
- **Option G** (price-semantics only) leaves usable stock UI wrong — fails user-visible acceptance.
- **Option H** (combined Guanciale rewrite) violates scope constraint.

### Optional tightening if SanPellegrino regresses

Restrict helper to `unitMeasurement === "g"` (covers Mozzarella `125GR*8` exclusively among VL `size_count` failures). Trade-off: future `size_count` cl/ml outer-pack lines would not auto-scale — acceptable given VL isolation proof (0 user-visible expansion beyond Mozzarella).

---

## Task 6 — Validation Plan

### Post-fix matrix — Mozzarella (must correct)

**Re-ingest invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968`

| Surface | Field | Current (wrong) | Expected after fix | Check method |
|---------|-------|-----------------|-------------------|--------------|
| Stock normalization replay | `normalizedUsableQuantity` | 1000 g | **10000 g** | `computeUsableFromPurchaseStructure` / phase1 replay |
| Stock normalization replay | `usableSource` | `structure_total` | **`structure_scaled_outer`** | trace log |
| Stock normalization replay | `purchaseContainerCount` | 1 | **10** | derived field |
| Invoice row | qty / unit_price / total | 10 / €8.12 / €81.23 | unchanged | VL DB read |
| Purchase history card | Last purchase | 10 un | 10 un | ingredient detail UI |
| Purchase history card | Procurement | €8.12/unit | €8.12/unit | unchanged |
| Ingredient detail | Usable stock | 1 kg | **10 kg** | UI / replay.json |
| Ingredient detail | Operational cost | €81.20/kg | **€8.12/kg** | `computeEffectiveUsableCost` |
| Recipe cost | Mozzarella line | ~10× inflated | **~10× decrease** | recipe using `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` |
| `ingredients` catalog | usable overlay | 1000 g | **10000 g** | post re-ingest sync |

### Regression matrix — must not change

| Product | Invoice | qty | Usable | Op cost | Check |
|---------|---------|----:|-------:|--------:|-------|
| Stracciatella 250 GR | f0aa5a08 | 24 | 6 kg | €12.44/kg | unit test + replay |
| Birra Peroni 33cl*24 | 36c99d19 | 24 | 7.92 L | €3.24/L | replay.json |
| ACQUA S.PELLEGRINO (CX 75CL*15) | f0aa5a08 | 2 | 11.25 L | €3.73/L | replay.json |
| Guanciale 1,5kg*7 | 36c99d19 | 5.996 | 10.5 kg | €6.18/kg | replay.json |
| Mezzi (CX 1KG*6) | f0aa5a08 | 2 | 6 kg | €4.55/kg | replay.json |
| Ricotta 1,5KG | f0aa5a08 | 2 | 3 kg | €2.66/kg | replay.json |

### Automated tests to add (implementation phase)

```typescript
// Mozzarella VL case
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8')!,
  10,
  'un',
) → { usableQuantity: 10000, usableSource: 'structure_scaled_outer', purchaseContainerCount: 10 }

// Peroni control
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('Birra Peroni 33cl*24')!,
  24,
  'un',
) → { usableQuantity: 7920, usableSource: 'structure_total' }

// Guanciale control
computeUsableFromPurchaseStructure(
  parsePurchaseStructureFromText('Guanciale +/- 1,5kg*7')!,
  5.996,
  'un',
) → { usableQuantity: 10500, usableSource: 'structure_total' } // unchanged until Guanciale track
```

### Manual checklist

- [ ] Invoice `f0aa5a08` Mozzarella row: qty=10, €8.12/unit, €81.23 total unchanged
- [ ] Ingredient detail: **10 kg usable**, **€8.12/kg** operational
- [ ] Sibling lines on same invoice unchanged (Pomodori, Rolo, Acqua, Stracciatella, Mezzi, Ricotta)
- [ ] Re-ingest `f0aa5a08` via `syncOperationalIngredientCostsFromInvoiceLines` propagates corrected usable
- [ ] Full VL 51-row replay scan: no new user-visible regressions

### Frozen baselines

| Artifact | Use |
|----------|-----|
| `.tmp/quantity-mismatch-ui-audit/replay.json` | UI + math baselines |
| `.tmp/phase1-validation-forensics-result.json` | Mozzarella structured block |
| `.tmp/bug-pattern-expansion-audit/population.json` | VL population |
| `.tmp/mozzarella-implementation-prep/readiness.json` | Value trace |

---

## Confidence

| Area | Score | Rationale |
|------|------:|-----------|
| Root cause / fix location | **0.94** | Stage 8 trace; exact functions and line ranges verified in source |
| Minimal option safety | **0.88** | Discriminators proven on VL controls; SanPellegrino cl edge needs matrix confirmation |
| Downstream self-correction | **0.91** | Price-semantics math verified: 10000 g → €8.12/kg without code change |
| Regression preservation | **0.87** | Peroni/Guanciale/Stracciatella/Mezzi/Ricotta logic paths distinct; SanPellegrino caveat |
| **Overall design confidence** | **0.89** | Ready for implementation with frozen regression matrix |

---

## Sources

| Artifact | Use |
|----------|-----|
| `.tmp/mozzarella-implementation-prep/` | Pipeline trace, value trace, change surface |
| `.tmp/stock-normalization-family-assessment/` | Mozzarella vs Guanciale causal comparison |
| `.tmp/remaining-bug-root-causes/` | Stage-by-stage first-wrong-value proof |
| `.tmp/bug-pattern-expansion-audit/` | VL isolation (1 user-visible; 0 expansion) |
| `src/lib/stock-normalization.ts` | Primary fix locus (lines cited above) |
| `src/lib/invoice-purchase-format.ts` | Orchestration entry |
| `src/lib/invoice-purchase-price-semantics.ts` | Downstream amplification analysis |
