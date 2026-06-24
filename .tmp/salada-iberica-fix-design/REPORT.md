# Salada Ibérica Operational Representation — Fix Design

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT DESIGN ONLY — no code changes, no DB writes, no deployments  
**Generated:** 2026-06-24

---

## Executive Summary

Salada Ibérica FSTK EMB. 250g shows **Procurement €2.19 / pack** (correct) and **Operational €2.19 / case** (wrong). Recipe costing and persistence are already correct at **€0.00876/g** (€8.76/kg). The bug is **display-only**: an Angus-style wholesale-case shortcut (`isCaseRowWithEmbeddedPieceWeightOnly` → `computeEffectiveUsableCost` hardcodes `unit: "case"`) is applied to **EMB pack rows** (`em`) where the embedded `250g` is the **full pack content**, not an unknown per-piece weight inside a wholesale case.

**Recommended fix (Option B):** Narrow the case-piece-weight operational shortcut to **wholesale case row units only** (`cx` / `caixa` / `case`). EMB pack rows (`em`, `emb`, `pack`, …) with weight bare_measure flow through the existing g→kg normalization path, aligning operational display with recipe persistence.

**Readiness: A) Ready for implementation** — confidence **0.91**

---

## 1. Current Flow Table

| Stage | Value | Unit | Notes |
|-------|-------|------|-------|
| **Invoice (DB)** | qty 4, unit_price €2.19, total €8.76 | `em` | Bidfood line `593e7560-…` |
| **normalizeInvoiceItemFields** | qty 4 | `em` | Unchanged |
| **parsePurchaseStructureFromText** | tier `bare_measure`, matched `250g` | g | `unitSize=250`, `unitMeasurement=g` |
| **computeUsableFromPurchaseStructure** | usable 250 | g | `usableSource=structure_total`, `purchaseContainerCount=1` |
| **resolveInvoiceLinePurchaseFormat** (persistence) | normalizedUsable 250 | g | `kind=weight_or_volume` — **correct** |
| **resolveStructuredPurchaseForDisplay** | normalizedUsable **null** | — | `adjustCasePieceWeightDisplay` nulls usable when `isCaseRow=true` |
| **resolvePriceSuffix** (procurement) | suffix `pack` | — | `em` → `ROW_UNIT_PRICE_SUFFIX['em']='pack'` via case-row branch |
| **isCaseRowWithEmbeddedPieceWeightOnly** | **true** | — | `em ∈ PACK_CONTAINER_ROW_UNITS` + bare_measure `250g` |
| **resolveUsablePerPricedUnit** (persisted) | 250 | g | Per-pack grams — **correct** |
| **computeEffectiveUsableCost** | cost **2.19** | **case** | **← FORK POINT** — early return, skips €/kg |
| **resolveInvoiceLinePricingPresentation** | procurement `€2.19 / pack`, operational `€2.19 / case` | — | Uses display structured (usable nulled) |
| **operationalCostFieldsFromInvoiceLine** (persistence) | current_price 2.19, purchase_quantity 250 | g | **Unaffected — correct** |
| **recipeOperationalCostFieldsFromInvoiceLine** | current_price 2.19, purchase_quantity 250 | g | **Unaffected — correct** |
| **buildLastPurchaseCostPresentation** (detail UI) | procurement `€2.19 / pack`, operational `€2.19 / case` | — | Pass-through from purchase memory labels |

### Fork Point

```
invoice_item (em, €2.19/pack, 250g embed)
  → resolveInvoiceLinePurchaseFormat        ✓ 250 g usable (persistence path)
  → resolveStructuredPurchaseForDisplay   ✗ nulls usable (display path)
  → isCaseRowWithEmbeddedPieceWeightOnly    ✓ true
  → computeEffectiveUsableCost L522-524     ✗ { cost: 2.19, unit: "case" }  ← FORK
  → resolveInvoiceLinePricingPresentation   ✗ effectiveUsableCostLabel = €2.19 / case
  → buildLastPurchaseCostPresentation       ✗ Operational Cost shown wrong
```

Persistence and recipe math **never enter** the case shortcut — they use `recipeOperationalCostFieldsFromInvoiceLine` → `inferUnitFamily('em', { usableQuantityUnit: 'g' })` → weight family → `cost_base_unit: 'g'`.

Evidence: `.tmp/salada-iberica-unit-audit/`, `.tmp/salada-iberica-operational-semantics-audit/`

---

## 2. Similar Products (EMB + Embedded Weight)

| Product | Row unit | Embedded | Procurement | Operational (current) | Recipe base | Family behaviour |
|---------|----------|----------|-------------|----------------------|-------------|------------------|
| **Salada Ibérica EMB 250g** | `em` | `250g` bare_measure | €2.19 / pack | **€2.19 / case** ✗ | g, pq=250 | Weight-family EMB pack — **should** show €/kg operational |
| **Manteiga Coimbra EMB 1 Kg** | `kg` | `1 Kg` | €8.90 / kg | €8.90 / kg ✓ | g, pq=1000 | True bulk kg row — procurement = operational |
| **Angus 180G** (control) | `cx` | `180g` bare_measure | €24.90 / case | €24.90 / case ✓ | g, pq=180 | Wholesale case, per-piece weight unknown — **must** stay per-case |

**VL sample (n=2 EMB/embedded-weight lines):** Only Salada (`em` pack) hits the case shortcut. Manteiga (`kg` bulk) bypasses it. Salada is the **sole VL outlier** with `/ case` operational label on an EMB product.

**Intended family behaviour:**

| Container semantics | Row units | Embedded measure meaning | Procurement display | Operational display |
|--------------------|-----------|--------------------------|---------------------|---------------------|
| Wholesale case (Angus) | `cx`, `caixa`, `case` | Per-piece weight; case count unknown | €/case | €/case (no €/kg from piece weight) |
| Retail EMB pack (Salada) | `em`, `emb`, `pack` | **Full pack content** | €/pack | €/kg (or €/g internally) |
| True bulk | `kg`, `L` | Line IS the measure | €/kg or €/L | Same as procurement |

---

## 3. Design Options

| Option | Behaviour | Risk | Scope |
|--------|-----------|------|-------|
| **A) Label-only** | Keep shortcut; change operational suffix `case` → `pack` for `em` rows | **High** — still shows €2.19/pack operational, not €8.76/kg; misaligned with recipe gram costing | 1 line in `computeEffectiveUsableCost` |
| **B) Narrow case shortcut (preferred)** | Apply case-piece-weight shortcut **only** for wholesale case units (`cx`/`caixa`/`case`). EMB pack rows use existing g→kg path | **Low** — Angus `cx` unchanged; dual-path display issue resolved by same gate on `adjustCasePieceWeightDisplay` | `invoice-purchase-format.ts` + `invoice-purchase-price-semantics.ts` (~15 lines) |
| **C) Persisted-structured cost call** | `resolveInvoiceLinePricingPresentation` calls `computeEffectiveUsableCost` with `resolveInvoiceLinePurchaseFormat` instead of display structured | **Medium** — fixes Salada only if shortcut removed; alone insufficient (shortcut still returns case); doesn't fix usable-stock display suppression | 1 call site |
| **D) Split detector function** | New `isWholesaleCaseRowWithPieceWeightOnly` (cx-only); deprecate broad `isCaseRow` for operational paths | **Low** — clearest semantics, slightly more refactor | 2 files + test rename |

**Recommendation: Option B** — minimal, reuses existing normalization math, matches architecture intent, lowest regression surface.

---

## 4. Regression Analysis

Replayed via local engine (`npx tsx`) against representative VL control fixtures. **Post-fix** = Option B gate applied (cx-only shortcut).

| Product | Procurement (current) | Operational (current) | Display change after fix? | Post-fix operational |
|---------|----------------------|----------------------|---------------------------|---------------------|
| **Salada Ibérica** | €2.19 / pack | €2.19 / case | **YES — fix target** | **€8.76 / kg** |
| Manteiga EMB 1kg | €8.90 / kg | €8.90 / kg | No | €8.90 / kg |
| Ovo classe M | €38.44 / case | null | No | null |
| Tomilho | €2.06 / bunch | null | No | null |
| Manjericão | €2.06 / bunch | €20.60 / kg | No | €20.60 / kg |
| Pellegrino 75cl×15 | €19.28 / case | €1.71 / L | No | €1.71 / L |
| Peroni 33cl×24 | €1.07 / bottle | €3.24 / L | No | €3.24 / L |
| Mozzarella 2Kg | €13.69 / bag | €6.85 / kg | No | €6.85 / kg |
| Guanciale 1.5kg×7 | €89.50 / unit | €8.52 / kg | No | €8.52 / kg |
| Ginger Beer 0.20cl | €9.69 / unit | €48.45 / L | No | €48.45 / L |
| Angus 180G cx | €24.90 / case | €24.90 / case | No | €24.90 / case |

**Angus regression guard:** Existing test `"formats Angus case with embedded piece weight as per-case not per-180g"` must continue to pass — `cx` remains in wholesale-case gate.

**Ginger Beer note:** VL current row is `un` (not `cx`); case-row masking is a separate known issue on historical `cx` rows — **out of scope** for this fix.

---

## 5. Expected Result (Salada Ibérica)

| Field | Before | After fix |
|-------|--------|-----------|
| Last Purchase | 4 packs | 4 packs (unchanged) |
| **Procurement Cost** | €2.19 / pack | **€2.19 / pack** (unchanged) |
| **Operational Cost** | €2.19 / case | **€8.76 / kg** |
| Total Paid | €8.76 | €8.76 (unchanged) |
| Recipe cost basis | €0.00876/g | €0.00876/g (unchanged) |
| 100g recipe line | €0.876 | €0.876 (unchanged) |
| Usable stock label (invoice card) | null (suppressed) | 250 g usable (restored) |

**Math:** `€2.19 ÷ (250g ÷ 1000) = €8.76/kg`

---

## 6. Validation Matrix

| Product | Must correct | Must not change | Check |
|---------|:------------:|:---------------:|-------|
| Salada Ibérica | ✓ Operational → €8.76/kg | Procurement €2.19/pack | VL ingredient `47cd8362-…`, item `593e7560-…` |
| Manteiga EMB 1kg | — | Procurement + operational €8.90/kg | VL item `e1fcc019-…` |
| Ovo classe M | — | €38.44/case, operational null | Unit audit control |
| Tomilho | — | €2.06/bunch, operational null | Unit audit control |
| Manjericão | — | €20.60/kg operational | Unit audit control |
| Pellegrino | — | €1.71/L operational | `computeEffectiveUsableCost` test Case B |
| Peroni | — | €3.24/L operational | `computeEffectiveUsableCost` test Case A |
| Mozzarella | — | €/kg operational (outer-qty fix separate) | Bocconcino replay |
| Guanciale | — | €/kg operational (stock-norm fix separate) | Guanciale design |
| Ginger Beer | — | Current `un` row behaviour | Ginger beer validation |
| Angus 180G cx | — | €24.90/case, no €/180g | `invoice-purchase-price-semantics.test.ts` Angus case |

---

## 7. Readiness

| Verdict | **A) Ready for implementation** |
|---------|--------------------------------|
| Confidence | **0.91** |
| Rationale | Root cause isolated to one early-return gate; persistence/recipe paths verified correct; fix is a narrow unit-family discriminator with full control replay; no schema or DB migration required |
| Residual risk | Unknown `em`/`pack` rows with bare_measure weight that are truly per-piece inside an opaque multi-pack (no VL examples); would gain €/kg display — aligns with weight-family recipe model |
| Not in scope | Ginger Beer `cx` row masking, Guanciale/Mozzarella/Pellegrino outer-qty stock-normalization fixes (separate designs) |

---

## Preferred Option — Exact Gate / Pseudocode

### New helper (invoice-purchase-format.ts)

```typescript
/** Wholesale case rows where embedded bare_measure is per-piece, not full pack content. */
const WHOLESALE_CASE_ROW_UNITS = new Set([
  "cx", "caixa", "caixas", "case", "cases",
]);

export function shouldApplyCasePieceWeightOperationalShortcut(
  name: string,
  rowUnit: string | null | undefined,
): boolean {
  if (!isCaseRowWithEmbeddedPieceWeightOnly(name, rowUnit)) return false;
  const normalized = rowUnit?.trim().toLowerCase();
  return normalized != null && WHOLESALE_CASE_ROW_UNITS.has(normalized);
}
```

### computeEffectiveUsableCost (invoice-purchase-price-semantics.ts)

```typescript
// REPLACE:
if (isCaseRowWithEmbeddedPieceWeightOnly(name, metadata.unit)) {
  return { cost: unitPrice, unit: "case" };
}

// WITH:
if (shouldApplyCasePieceWeightOperationalShortcut(name, metadata.unit)) {
  return { cost: unitPrice, unit: "case" };
}
// else: existing resolveUsablePerPricedUnit → g→kg / ml→L path
```

### adjustCasePieceWeightDisplay (invoice-purchase-format.ts)

```typescript
// REPLACE isCaseRowWithEmbeddedPieceWeightOnly check WITH:
if (!shouldApplyCasePieceWeightOperationalShortcut(name, rowUnit)) return structured;
```

This restores `normalizedUsableQuantity: 250` on the display path for Salada, enabling invoice-card usable labels and consistent operational derivation.

### resolvePriceSuffix step 1 (invoice-purchase-price-semantics.ts)

```typescript
// REPLACE isCaseRowWithEmbeddedPieceWeightOnly WITH shouldApplyCasePieceWeightOperationalShortcut
// Salada em falls through to step 4 → 'pack' (unchanged procurement)
// Angus cx still hits step 1 → 'case' (unchanged)
```

### Salada post-fix trace (expected)

```
isCaseRowWithEmbeddedPieceWeightOnly("Salada Ibérica FSTK EMB. 250g", "em") → true (unchanged detector)
shouldApplyCasePieceWeightOperationalShortcut(...) → false (em ∉ WHOLESALE_CASE)
resolveUsablePerPricedUnit → { amount: 250, unit: "g" }
computeEffectiveUsableCost → { cost: 8.76, unit: "kg" }
resolveInvoiceLinePricingPresentation → operational "€8.76 / kg"
```

---

## Evidence Files

- `.tmp/salada-iberica-unit-audit/REPORT.md` + `results.json`
- `.tmp/salada-iberica-operational-semantics-audit/REPORT.md` + `results.json`
- `src/lib/invoice-purchase-format.ts` — `isCaseRowWithEmbeddedPieceWeightOnly` L213-224, `adjustCasePieceWeightDisplay` L227-242
- `src/lib/invoice-purchase-price-semantics.ts` — `computeEffectiveUsableCost` L516-547, `resolveInvoiceLinePricingPresentation` L1132-1188
- `src/lib/ingredient-detail-panel.ts` — `buildLastPurchaseCostPresentation` L299-335
- `src/lib/ingredient-purchase-memory.ts` — `resolvePurchaseCostLabels` L94-103
