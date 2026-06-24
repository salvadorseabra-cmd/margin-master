# Paccheri / Ginger Beer Representation Source Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes  
**Audited:** 2026-06-23  
**Invoice:** Emporio Italia `ab52796d-de1d-418d-86e7-230c8f056f09`

---

## Executive summary

Paccheri Lisci and Ginger Beer show bare **24** instead of **24 un** because **`invoice_items.unit` is `null` in VL** while quantity is 24. The UI formatters are working as designed: they omit the unit suffix when `unit` is empty.

The persistence gap was caused historically by GPT Pass C omitting `unit` on embedded-measure countables (`500g`, `0.20cl`) combined with the pre-fix `resolveInvoicePersistedItemUnit` returning `fallback_null` on `weight_or_volume` rows. **Current workspace code** adds gated `un` inference in `resolveInvoicePersistedItemUnit`; replay confirms both rows would persist `un` on re-insert.

**Goal classification:** **C) Persistence/re-read required** (not UI-only, not query bug)  
**Final verdict:** **A) Re-read required only** — code fix exists; UI auto-corrects once `invoice_items.unit` is repopulated.

---

## Live VL evidence (read-only, 2026-06-23)

| Product | `invoice_items.id` | qty | unit |
|---------|-------------------|-----|------|
| De Cecco Paccheri Lisci 500g | `cdecef89-…` | 24 | **null** |
| Baladin Ginger Beer 0.20cl | `e41a41e6-…` | 24 | **null** |
| SanPellegrino 75cl x 15ud | `68ae8c0c-…` | 2 | **un** |

---

## Q1 — Paccheri full trace

| Field | Value | Source |
|-------|-------|--------|
| `invoice_items.quantity` | 24 | VL `invoice_items` |
| `invoice_items.unit` | **null** | VL `invoice_items` |
| Row purchase qty (`purchaseQuantity`) | 24 | Invoice row quantity (countable outer qty) |
| Structured `purchaseUnit` | **g** | `resolveInvoiceLinePurchaseFormat` → `weight_or_volume`, 24 × 500 g |
| `ingredients.purchase_unit` | un | Catalog/procurement (1 un per pack semantics) |
| `ingredients.purchase_quantity` | 1 | Catalog |
| `resolveInvoiceLinePurchaseUnit` | `{ unit: null, source: "fallback_null" }` | No OCR unit + not `multi_unit_pack` |
| `resolveInvoicePersistedItemUnit` (current code) | **un** | Gated embedded-measure inference |
| Extraction (ab52796d upload) | qty 24, unit **null** | `.tmp/invoice-unit-persistence-audit` |
| Extraction (pass-c-raw variant) | qty 24, unit **un** | `.tmp/persistence-audit/pass-c-raw/…` |

---

## Q2 — Ginger Beer full trace

| Field | Value | Source |
|-------|-------|--------|
| `invoice_items.quantity` | 24 | VL `invoice_items` |
| `invoice_items.unit` | **null** | VL `invoice_items` |
| Row purchase qty | 24 | Invoice row |
| Structured `purchaseUnit` | **cl** → 4800 ml usable | `weight_or_volume`, 24 × 20 cl |
| `ingredients.purchase_unit` | ml | Catalog (200 ml bottle semantics) |
| `resolveInvoiceLinePurchaseUnit` | `{ unit: null, source: "fallback_null" }` | Same mechanism as Paccheri |
| `resolveInvoicePersistedItemUnit` (current code) | **un** | Gated inference |
| Extraction variance | Same as Paccheri (null on live upload, un on some frozen extracts) | `.tmp/invoice-unit-persistence-audit` |

---

## Q3 — Invoice Review field path

**Render chain:** `ItemsTable` → `resolveInvoiceLinePricingPresentation({ name, quantity, unit, unit_price, line_total })` → `card.purchaseQuantityLine`

```1132:1154:src/lib/invoice-purchase-price-semantics.ts
export function resolveInvoiceLinePricingPresentation(
  metadata: InvoicePurchasePriceMetadata,
): InvoiceLinePricingPresentation {
  // ...
  const rowQuantityLabel = formatRowPurchaseQuantityLabel(metadata);
  const purchasedPackDetail = formatPurchasedPackDetail(structured, name, metadata.unit);
  // ...
  const card = buildNormalizationCard({
    rowQuantityLabel,
    purchasedPackDetail,
```

- **Primary input:** `invoice_items.quantity` + **`invoice_items.unit`** (passed as `metadata.unit`).
- **Secondary input:** structured purchase format from **product name** (`formatPurchasedPackDetail`) — only when `multi_unit_pack` with inner count > 1.
- **Not used for row label:** `ingredients.purchase_unit`, procurement fields, or structured `purchaseContainerUnit`.

**Current Paccheri/Ginger Invoice Review:** `purchaseQuantityLine = "24"` (no pack suffix).

---

## Q4 — Ingredient Detail Last Purchase field path

**Render chain:** `loadIngredientMatchedInvoiceProducts` → `buildRecentPurchases` → `formatRowPurchaseQuantityLabel(invoiceMetadataFromProduct(product))` → `buildLastPurchaseCostPresentation` → `"Last Purchase"` line

```48:57:src/lib/ingredient-purchase-memory.ts
function invoiceMetadataFromProduct(
  product: IngredientMatchedInvoiceProduct,
): InvoicePurchasePriceMetadata {
  return {
    name: product.itemName,
    quantity: product.quantity,
    unit: product.unit,
```

```298:317:src/lib/ingredient-detail-panel.ts
export function buildLastPurchaseCostPresentation(
  purchase: RecentPurchaseRow | null | undefined,
): IngredientOperationalCostPresentation | null {
  const lastPurchase = purchase.purchaseQuantityLabel?.trim() || null;
  // ...
  pushPresentationLine(lines, "Last Purchase", lastPurchase);
```

- **Last Purchase uses:** `invoice_items.unit` via matched invoice product scan — **not** `ingredients.purchase_unit`.
- **Purchase history** stores price rows only; quantity label is recomputed from invoice line metadata at display time.
- **Current Paccheri/Ginger Last Purchase:** `"24"`.

---

## Q5 — If re-read today, would `invoice_items.unit` become `un`?

**YES.**

Evidence:

1. **Current resolver** (`resolveInvoicePersistedItemUnit` lines 1549–1551) calls `shouldInferUnForEmbeddedMeasureCountable` when `resolveInvoiceLinePurchaseUnit` returns `fallback_null`, OCR unit is null, `weight_or_volume`, integer qty > 1, embedded g/ml/cl in name, no pack markers → returns `"un"`.

2. **Replay corpus** (`.tmp/embedded-measure-un-inference-validation/results.json`):
   - Paccheri: `dbUnit: null` → `afterResolvedUnit: "un"`
   - Ginger: `dbUnit: null` → `afterResolvedUnit: "un"`

3. **Re-read insert path** (`invoices.tsx` `runExtraction`): deletes + re-inserts rows with `unit: resolveInvoiceItemUnit(...)` which delegates to `resolveInvoicePersistedItemUnit`.

4. OCR variance (unit `un` vs `null`) does not block fix: if OCR supplies `un`, `preserveCountableExtractedUnit` path also persists `un`.

---

## Q6 — If yes, would UI auto-show `24 un` without UI changes?

**YES.**

```767:787:src/lib/invoice-purchase-price-semantics.ts
export function formatRowPurchaseQuantityLabel(
  metadata: InvoiceLinePurchaseInput,
): string | null {
  // ...
  if (normalizedRowUnit) {
    return `${formatPurchaseCount(rowQuantity)} ${normalizedRowUnit}`;
  }
  return formatPurchaseCount(rowQuantity);
}
```

With `unit = "un"`, both Invoice Review and Ingredient Detail formatters emit **`24 un`**. No formatter change required.

**Note:** Paccheri/Ginger will **not** gain a pack-detail suffix (`· 500 g` / `· 20 cl`) in Invoice Review because `formatPurchasedPackDetail` only fires for `multi_unit_pack` rows (`resolveUnitsPerPack`). That is expected and matches Peroni-style rows without multipack markers.

---

## Q7 — Why Pellegrino shows `2 un · 15 × 75 cl` vs Paccheri `24`

| Factor | Paccheri / Ginger | Pellegrino (Emporio) |
|--------|-------------------|----------------------|
| `invoice_items.unit` | **null** | **un** |
| `structured.kind` | `weight_or_volume` | `multi_unit_pack` |
| `formatRowPurchaseQuantityLabel` | bare `24` | `2 un` |
| `formatPurchasedPackDetail` | **null** (no inner pack from `resolveUnitsPerPack`) | `15 × 75 cl` |
| Combined Invoice Review | `24` | `2 un · 15 × 75 cl` |

Pellegrino name contains `75cl x 15ud` → multipack structure + persisted countable unit. Paccheri/Ginger names embed per-item measure (`500g`, `0.20cl`) without multipack markers → `weight_or_volume` + missing persisted unit → bare quantity only.

Reference controls (Açúcar, Pomodori) follow the Pellegrino pattern: persisted `cx`/`un` + `multi_unit_pack` → rich `row · inner` display.

---

## Required stage table

| Stage | Paccheri | Ginger Beer | Pellegrino |
|-------|----------|-------------|------------|
| **Extraction** | qty 24, unit null (ab52796d path) | qty 24, unit null | qty 2, unit un |
| **Persisted unit** | **null** | **null** | **un** |
| **Purchase format** | weight_or_volume — 24 × 500 g | weight_or_volume — 24 × 20 cl | multi_unit_pack — 15 × 75 cl |
| **Query output** | qty 24, unit null | qty 24, unit null | qty 2, unit un |
| **UI formatter input** | `formatRowPurchaseQuantityLabel({24, null})`; pack detail null | same | `{2, un}` + pack detail `15 × 75 cl` |
| **UI rendered output** | **24** | **24** | **2 un · 15 × 75 cl** |

---

## If Salvador presses Re-read now on Emporio invoice — visual delta

| Surface | Paccheri | Ginger Beer | Pellegrino |
|---------|----------|-------------|------------|
| Invoice Review purchase line | `24` → **`24 un`** | `24` → **`24 un`** | unchanged `2 un · 15 × 75 cl` |
| Ingredient Detail Last Purchase | `24` → **`24 un`** | `24` → **`24 un`** | unchanged `2 un` |
| Normalized usable / cost lines | unchanged (`12 kg usable`, `€4.20/kg`) | unchanged (`4.8 L usable`, `€4.05/L`) | unchanged |
| Pack-detail suffix | still none (not multi_unit_pack) | still none | unchanged |

Re-read deletes and re-inserts `invoice_items` rows; ingredient catalog `purchase_unit` values are unaffected. Stock/cost math is **DISPLAY_ONLY** change (confirmed by embedded-measure validation replay: zero calculation-risk deltas).

---

## Final verdict

**A) Re-read required only**

- Resolver fix is in workspace code; VL rows are stale (`unit = null`).
- UI correctly reflects DB; no UI fix needed.
- User action: Re-read Emporio invoice `ab52796d` to repopulate `invoice_items.unit = 'un'` for Paccheri and Ginger Beer.

---

## Evidence index

| Artifact | Role |
|----------|------|
| `.tmp/embedded-measure-un-inference-validation/` | Post-fix replay — 2 rows change null→un, DISPLAY_ONLY |
| `.tmp/purchase-unit-representation-audit/` | UI formatter simulation, lifecycle traces |
| `.tmp/invoice-unit-persistence-audit/` | Extraction→insert pipeline, historical unit regression |
| VL live query `ab52796d` 2026-06-23 | Confirms `unit=null` on Paccheri/Ginger, `unit=un` on Pellegrino |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoicePersistedItemUnit`, `shouldInferUnForEmbeddedMeasureCountable` |
| `src/lib/invoice-purchase-price-semantics.ts` | `formatRowPurchaseQuantityLabel`, `formatPurchasedPackDetail` |
| `src/routes/invoices.tsx` | Re-read = delete + insert with `resolveInvoiceItemUnit` |
