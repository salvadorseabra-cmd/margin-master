# Embedded-Measure `un` Inference — Implementation & Validation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Implemented:** 2026-06-23  
**Scope:** `resolveInvoicePersistedItemUnit` only (+ unit tests)

## Verdict

### **A) Safe to merge**

Gated inference matches exactly the 2 expected VL rows (Paccheri, Ginger Beer) with **DISPLAY_ONLY** impact. Zero regressions on the must-not-change matrix. Zero calculation-risk changes across 52 invoice_items.

---

## Implementation

Added a 6-condition gate in `resolveInvoicePersistedItemUnit` (`src/lib/invoice-purchase-format.ts`) that infers `un` only when:

1. OCR unit is null
2. `resolveInvoiceLinePurchaseFormat().kind === "weight_or_volume"`
3. Quantity is integer and > 1
4. Name embeds retail g/ml/cl measure (not kg/L purchase denomination)
5. Name lacks pack-denomination markers (`EMB`, `CX`, `CAIXA`, `PACK`)
6. `resolveInvoiceLinePurchaseUnit()` returns `fallback_null`

### New helpers (private)

| Helper | Purpose |
|--------|---------|
| `embeddedRetailMeasureInName` | Detects g/gr/grs/ml/cl in name; excludes kg/L |
| `hasPackDenominationMarkersInName` | Blocks EMB/CX/CAIXA/PACK rows |
| `shouldInferUnForEmbeddedMeasureCountable` | Combines all 6 gate conditions |

Gate logic derived from `.tmp/resolve-unit-infer-un-safety/REPORT.md` and `results.json` (`conditionalSafeGate`).

---

## Before / After (changed rows only)

| Product | DB qty | DB unit | Before | After | Impact |
|---------|-------:|---------|--------|-------|--------|
| De Cecco - Paccheri Lisci Nr. 125 - 500g | 24 | null | null | **un** | DISPLAY_ONLY |
| Baladin - Ginger Beer 0.20cl | 24 | null | null | **un** | DISPLAY_ONLY |

Last Purchase display: `24` → `24 un`. Usable quantity, €/kg, €/L, and recipe procurement fields unchanged.

---

## Regression Matrix (must-not-change)

| Product | DB unit | Before | After | Changed? |
|---------|---------|--------|-------|----------|
| Peroni 33cl*24 | un | un | un | No |
| Pellegrino 75cl×15 | un | un | un | No |
| Açúcar 10x1kg | cx | cx | cx | No |
| Pomodori 2.5kg×6 | un | un | un | No |
| Mozzarella 125g×8 | un | un | un | No |
| Guanciale | un | un | un | No |

---

## Blast Radius

| Metric | Value |
|--------|------:|
| Total VL invoice_items | 52 |
| Rows with unit change | **2** |
| DISPLAY_ONLY changes | 2 |
| CALCULATION_RISK changes | **0** |

Only Paccheri and Ginger Beer change. All other 50 rows resolve identically to pre-implementation baseline.

### Excluded false-positive classes (gate blocks)

| Class | Example | Blocked by |
|-------|---------|------------|
| Bulk kg purchase | Gorgonzola 1,5kg | kg in name |
| EMB pack rows | Manteiga EMB 1 Kg, Salada EMB. 250g | EMB marker / kg |
| Counter-weight deli | Prosciutto 4,25Kg @ 4.3 | non-integer qty + kg |
| Multipack beverages | Peroni 24x33cl | `multi_unit_pack` (existing `un` path) |

---

## Tests

### Unit tests (`src/lib/invoice-purchase-format.test.ts`)

New describe block: `resolveInvoicePersistedItemUnit — embedded retail measure countable (gated un)`

| Category | Cases | Result |
|----------|------:|--------|
| Expected fixes (Paccheri, Ginger) | 2 | Pass |
| Must-not-regress (6 products) | 6 | Pass |
| False-positive guards (4 products) | 4 | Pass |

**Full file run:** 84 passed, 2 failed (pre-existing `24x33cl` display assertions — unrelated to this change).

---

## Changed Files

| File | Change |
|------|--------|
| `src/lib/invoice-purchase-format.ts` | Gated `un` inference in `resolveInvoicePersistedItemUnit` |
| `src/lib/invoice-purchase-format.test.ts` | 12 new test cases for gate behavior |

**Not touched:** extraction pipeline, `stock-normalization`, Family A, Ginger Beer parsing (`ingredient-unit-inference`), Guanciale logic.

---

## Evidence

- `.tmp/embedded-measure-un-inference-validation/REPORT.md` — this report
- `.tmp/embedded-measure-un-inference-validation/results.json` — full 52-row before/after replay
- `.tmp/embedded-measure-un-inference-validation/replay.mts` — post-implementation replay script
- `.tmp/resolve-unit-infer-un-safety/` — pre-implementation safety analysis (basis)
