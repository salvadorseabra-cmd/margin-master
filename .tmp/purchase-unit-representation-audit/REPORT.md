# Purchase Unit Representation Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code/DB writes  
**Verdict:** **Mixed**

## Summary

Ingredient Detail **Last Purchase** is driven by `formatRowPurchaseQuantityLabel` over matched `invoice_items` (`quantity` + `unit`). It does **not** read `ingredients.purchase_unit` or pack-detail formatters.

When `invoice_items.unit` is **null**, the label collapses to bare quantity (e.g. `24`). When unit is present (`un`, `cx`, `lata`), the label includes unit or container noun (`24 un`, `2 cases`, `1 un`).

Paccheri Lisci and Ginger Beer (Emporio Italia May 2026) have **null** `invoice_items.unit` in VL. Fresh extract JSON had `unit: "un"` for Paccheri (`24 un`) but DB stores `unit: null`. Ginger Beer fresh extract was `2 un` (not 24) — both quantity and unit diverge from stored row. This is a **data persistence gap** at `invoice_items`, compounded by UI that does not fall back to catalog or structured pack labels.

## Extraction vs DB (Emporio Italia, invoice `ab52796d`)

| Product | Fresh extract qty/unit | DB `invoice_items` | Gap |
|---------|------------------------|-------------------|-----|
| Paccheri Lisci | 24 / `un` | 24 / **null** | Unit lost at persist |
| Ginger Beer | 2 / `un` | 24 / **null** | Qty inflated + unit lost |

## Required Table

| Product | Invoice Quantity | Invoice Unit | purchaseQuantity | purchaseUnit | Persisted Purchase Unit | Ingredient Detail Value | Expected Display | Status |
|---------|------------------|--------------|------------------|--------------|-------------------------|-------------------------|------------------|--------|
| Paccheri Lisci | 24 | null | 24 | g | ingredients:un / invoice_items:null | 24 | 24 un | DATA_LOSS |
| Ginger Beer (Baladin) | 24 | null | 24 | cl | ingredients:ml / invoice_items:null | 24 | 24 un | DATA_LOSS |
| Peroni Nastro Azzurro 33cl | 24 | un | 24 | un | ingredients:un / invoice_items:un | 24 un | 24 un | OK |
| Pellegrino 75cl×15 | 2 | un | 15 | un | ingredients:un / invoice_items:un | 2 un | 2 un | OK |
| Açúcar Branco 10x1kg | 1 | cx | 10 | kg | ingredients:un / invoice_items:cx | 1 case | 1 case | OK |
| Pomodori | 1 | un | 6 | un | ingredients:un / invoice_items:un | 1 un | 1 un | OK |

## Seven Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Does purchaseUnit exist in DB for Paccheri? | **Yes** on `ingredients.purchase_unit` (`un`); **No** on latest `invoice_items.unit` (null) |
| 2 | Does purchaseUnit exist in DB for Ginger Beer? | **Yes** on `ingredients.purchase_unit` (catalog); **No** on `invoice_items.unit` (null) |
| 3 | Does Ingredient Detail query fetch purchaseUnit? | **No** — fetches invoice line `quantity`/`unit` via matched products scan |
| 4 | Is purchaseUnit discarded before reaching UI? | **Yes** — `ingredients.purchase_unit` unused for Last Purchase; missing `invoice_items.unit` drops suffix |
| 5 | Is UI intentionally rendering quantity only? | **Yes, when unit is null** — `formatRowPurchaseQuantityLabel` line 787 returns `formatPurchaseCount(rowQuantity)` only |
| 6 | First stage where unit disappears? | **invoice_items persistence** (unit null in DB for Paccheri/Ginger); extraction handoff for Emporio rows may omit unit before insert |
| 7 | Classification | **D) Mixed** — persistence loss on invoice_items.unit + UI design that does not fall back to ingredients.purchase_unit or structured pack detail |

## Lifecycle Trace

### Paccheri Lisci / Ginger Beer (DATA_LOSS)

1. **Extraction** — qty 24; unit often `un` in fresh extract JSON (Emporio) but **null** in stored `invoice_items`
2. **invoice_items** — `quantity=24`, `unit=null`
3. **Purchase format** — `purchaseContainerCount=24`, `purchaseContainerUnit` from structure
4. **Stock normalization** — usable g/ml computed from embedded pack size in name
5. **Ingredient persistence** — `ingredients.purchase_unit` may be `un` / `ml` (catalog fields)
6. **Purchase history** — `buildRecentPurchases` → `purchaseQuantityLabel` = `"24"` (no unit)
7. **Ingredient Detail UI** — `buildLastPurchaseCostPresentation` → Last Purchase = `"24"`

### Peroni / Pellegrino / Açúcar / Pomodori (OK or richer invoice review)

- **Peroni:** `invoice_items.unit=un` → Last Purchase `24 un`
- **Pellegrino:** `unit=un` or `cx` → `2 un` or `2 cases`; invoice review adds `15 × 75 cl` via `formatPurchasedPackDetail`
- **Açúcar:** `unit=cx` → `1 case`
- **Pomodori:** `unit=un` → `1 un`; pack detail `6 × 2.5 kg` only on invoice review card

## Cross-Check: Why richer products display correctly

| Product | Invoice Review | Ingredient Detail Last Purchase | Why |
|---------|----------------|----------------------------------|-----|
| Pellegrino | `2 cases · 15 × 75 cl` (or `2 un · …`) | `2 cases` or `2 un` | Row unit present; pack detail is **invoice-review-only** |
| Açúcar | `1 case · …` | `1 case` | Row unit `cx` persisted |
| Pomodori | `1 un · 6 × 2.5 kg` | `1 un` | Row unit `un` persisted |
| Paccheri | May show structured display from name | `24` only | **`invoice_items.unit` null** |
| Ginger Beer | Similar | `24` only | **`invoice_items.unit` null** |

## Code References

- Last Purchase display: `buildLastPurchaseCostPresentation` → `purchase.purchaseQuantityLabel` (`src/lib/ingredient-detail-panel.ts:299-304`)
- Label builder: `formatRowPurchaseQuantityLabel` (`src/lib/invoice-purchase-price-semantics.ts:768-787`)
- Purchase memory: `buildRecentPurchases` (`src/lib/ingredient-purchase-memory.ts:209`)
- Invoice review richer line: `buildNormalizationCard.purchaseQuantityLine` = row qty + pack detail (`invoice-purchase-price-semantics.ts:831`)

## Evidence Files

- `.tmp/purchase-unit-representation-audit/results.json` — full per-product lifecycle JSON
- Prior corroboration: `.tmp/quantity-mismatch-validation/mismatches.json` (Paccheri/Ginger `invoiceUnit: null`, `lastPurchaseLabel: "24"`)
