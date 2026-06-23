# Quantity Mismatch UI Audit — READ-ONLY

**Generated:** 2026-06-21  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Scope:** 19 mismatch rows / 16 unique ingredients from `.tmp/quantity-mismatch-validation/mismatches.json`

## Method

Reconstructed each row end-to-end using production code paths (no DB writes):

1. **Invoice row** — VL `invoice_items` + frozen extracts in `.tmp/final-validation-lab-rerun/extracts/` where available
2. **Monetary binding** — `bindMonetaryColumns`
3. **Structure** — `resolveInvoiceLinePurchaseFormat`, `resolveInvoiceLineStockPresentation`
4. **Cost denominator** — `resolveCountablePurchaseQuantityForCost`, `recipeOperationalCostFieldsFromInvoiceLine`
5. **UI labels** — `formatRowPurchaseQuantityLabel`, `resolveInvoiceLinePricingPresentation` → same fields surfaced by `buildLastPurchaseCostPresentation` on the ingredient detail **Purchase economics** card

**Question answered:** Does the ingredient detail page show the correct operational reality to the user?

---

## Summary counts

| Classification | Count | Meaning |
|----------------|------:|---------|
| **A — Confirmed Bug** | **4** | UI contradicts invoice or shows wrong economics/usable stock |
| **B — Suspicious** | **0** | Ambiguous; partially misleading |
| **C — Operationally Correct** | **15** | Displayed economics match invoice reality (internal `purchase_quantity` may differ) |

### Conclusion

**Only Ricotta/Mezzi Family A pattern? No.** Of 19 flagged rows:

- **2 Family A rows:** Ricotta is **C** (UI correct); Mezzi is **A** (usable understates 2 cases as 6 kg).
- **+2 non–Family A confirmed bugs:** Ginger beer (volume parse), Mozzarella fior di latte (usable 1 kg vs 10 packs), Guanciale (pack notation vs weight line).
- **15 rows** are **operationally correct on the detail page** despite internal quantity-mismatch signals — mostly multi-unit per-item pricing collapse (9 rows) and multi-layer pack inner counts (6 rows).

---

## Full table

| # | Ingredient | Invoice Reality | UI Reality | Math Correct? | User-visible bug? |
|---|------------|-----------------|------------|:-------------:|:-----------------:|
| 1 | Anchoas | 2 un × €9.99 = €19.98; 495 g/can | Last 2 un · Proc €9.99/can · Op €20.18/kg · Usable 990 g | Yes | **C** |
| 2 | Gema líquida | 6 un × €10.49 = €62.94; 1 kg/unit | Last 6 un · Proc €10.49/unit · Op €10.49/kg · Usable 6 kg | Yes | **C** |
| 3 | Anchoas | 2 un × €9.49 = €18.98; 495 g/can | Last 2 un · Proc €9.49/can · Op €19.17/kg · Usable 990 g | Yes | **C** |
| 4 | Gema líquida | 6 un × €10.19 = €61.14; 1 kg/unit | Last 6 un · Proc €10.19/unit · Op €10.19/kg · Usable 6 kg | Yes | **C** |
| 5 | Atum em óleo | 2 un × €6.29 = €12.58; 1 kg/bag | Last 2 un · Proc €6.29/bag · Op €6.29/kg · Usable 2 kg | Yes | **C** |
| 6 | Mozzarella fior di latte | 10 un × €8.12 = €81.23; 125 g×8/pack (=1 kg) | Last 10 un · Proc €8.12/unit · Op **€81.20/kg** · Usable **1 kg** | **No** | **A** |
| 7 | Stracciatella | 24 un × €3.11 = €74.54; 250 g/unit | Last 24 un · Proc €3.11/unit · Op €12.44/kg · Usable 6 kg | Yes | **C** |
| 8 | Mezzi paccheri mancini | 2 cases (CX 1KG×6) = €27.30; **12 kg** | Last 2 un · Proc €13.65/case · Op €4.55/kg · Usable **6 kg** | **No** | **A** |
| 9 | Pomodori pelati | 1 case (2.5KG×6) = €22.05; 15 kg | Last 1 un · Proc €22.05/case · Op €1.47/kg · Usable 15 kg | Yes | **C** |
| 10 | Água san pellegrino | 2 cases (75cl×15) = €42.07; 11.25 L | Last 2 un · Proc €20.97/case · Op €3.73/L · Usable 11.25 L | Yes | **C** |
| 11 | Ricotta trevigiana | 2 un × €3.99 = €7.97; 1.5 kg/unit | Last 2 un · Proc €3.99/unit · Op €2.66/kg · Usable 3 kg | Yes | **C** |
| 12 | Paccheri lisci | 24 × €2.10 = €50.40; 500 g each | Last 24 · Proc €2.10 · Op €4.20/kg · Usable 12 kg | Yes | **C** |
| 13 | Água san pellegrino | 2 cases (75cl×15) = €38.56; 11.25 L | Last 2 un · Proc €19.28/case · Op €3.43/L · Usable 11.25 L | Yes | **C** |
| 14 | Ginger beer | 24 × €0.81 = €19.38; ~20 cl/bottle | Last 24 · Proc €0.81 · Op **€405/L** · Usable **48 ml** | **No** | **A** |
| 15 | Guanciale stagionato | **5.996 kg** × €10.83 = €64.93 | Last 6.00 un · Proc €10.83/unit · Op **€6.18/kg** · Usable **10.5 kg** | **No** | **A** |
| 16 | Peroni 33cl | 24 bottles × €1.07 = €25.69 | Last 24 un · Proc €1.07/bottle · Op €3.24/L · Usable 7.92 L | Yes | **C** |
| 17 | Aceto balsamico IGP | 1 un (5 L×2) = €16.09; 10 L | Last 1 un · Proc €15.55/unit · Op €1.56/L · Usable 10 L | Yes | **C** |
| 18 | Mozzarella julienne | 10 bags × €20.03 = €200.30; 3 kg/bag | Last 10 un · Proc €20.03/bag · Op €6.68/kg · Usable 30 kg | Yes | **C** |
| 19 | Rulo di capra | 1 un (1 kg×2) = €10.86; 2 kg | Last 1 un · Proc €10.86/unit · Op €5.43/kg · Usable 2 kg | Yes | **C** |

---

## Confirmed user-visible bugs (A) — detail

### 1. Ginger beer (`634a418b…`)

| Field | Invoice | UI |
|-------|---------|-----|
| Qty | 24 bottles @ €0.81 | Last Purchase **24** ✓ |
| Volume | 24 × ~20 cl ≈ 4.8 L | Usable **48 ml** ✗ |
| Cost | ~€4/L | Operational **€405/L** ✗ |

**Root cause:** Product name `0.20cl` parsed as 2 ml per bottle (24×2 = 48 ml), not 20 cl.

### 2. Mezzi paccheri mancini (`bb4bbfac…`, Family A)

| Field | Invoice | UI |
|-------|---------|-----|
| Qty | **2 cases** (CX 1KG×6) | Last Purchase **2 un** ✓ |
| Weight | **12 kg** (2×6 kg) | Usable **6 kg** ✗ |
| €/kg | €27.30 ÷ 12 = **€2.28/kg** | Operational **€4.55/kg** ✗ |

**Root cause:** `resolveCountablePurchaseQuantityForCost` collapses to 1 priced unit; usable stock uses one case volume while Last Purchase shows 2.

### 3. Mozzarella fior di latte (`095b2bb9…`)

| Field | Invoice | UI |
|-------|---------|-----|
| Qty | **10 packs** (125 g×8 = 1 kg each) | Last Purchase **10 un** ✓ |
| Weight | **10 kg** | Usable **1 kg** ✗ |
| €/kg | €81.23 ÷ 10 = **€8.12/kg** | Operational **€81.20/kg** ✗ |

**Root cause:** Multi-unit collapse uses single-pack usable (1 kg) instead of invoice qty × pack size.

### 4. Guanciale stagionato (`6efebedf…`)

| Field | Invoice | UI |
|-------|---------|-----|
| Qty | **5.996** (weight line, €10.83/kg → €64.93) | Last Purchase **6.00 un** (rounding OK) |
| Weight | **~6 kg** purchased | Usable **10.5 kg** (7×1.5 kg from name) ✗ |
| €/kg | **€10.83/kg** | Operational **€6.18/kg** ✗ |

**Root cause:** Pack notation `*7` in product name applied as usable multiplier on a weight-priced line.

---

## Family A split

| Ingredient | Family A | UI correct? | Classification |
|------------|:--------:|:-----------:|:--------------:|
| Ricotta trevigiana | ✓ | Yes — 2 un, 3 kg, €2.66/kg all match €7.97 total | **C** |
| Mezzi paccheri mancini | ✓ | No — 2 cases shown but only 6 kg usable | **A** |

Family A binding collapse affects **stored** `purchase_quantity` on both, but only Mezzi produces a **user-visible** usable/cost error.

---

## Operationally correct rows (C) — why flagged but not bugs

### Multi-unit per-item pricing collapse (9 rows: Anchoas×2, Gema×2, Atum, Stracciatella, Mozzarella julienne)

- **Internal:** `resolveCountablePurchaseQuantityForCost` → 1 when `total ≈ qty × unit_price`; stored `purchase_quantity=1`.
- **UI:** `computeEffectiveUsableCost` and stock normalization multiply by invoice qty correctly.
- **User sees:** Last Purchase = invoice qty; usable = qty × pack size; operational = line total ÷ usable. **All consistent.**

Example (Anchoas): stored PQ=1, but UI shows 2 un / 990 g / €20.18/kg = €19.98÷0.99 kg ✓.

### Pack inner-count signal only (6 rows: Pomodori, S.Pellegrino×2, Paccheri, Peroni, Aceto, Rulo)

- **Internal:** `purchaseContainerCount` (inner units) > `purchaseQtyForCost` (outer cases).
- **UI:** Usable and operational cost use full expanded pack volume; math = total ÷ usable ✓.

Example (Pomodori): 1 case → 15 kg usable, €1.47/kg = €22.05÷15 ✓.

---

## Row-by-row reconstruction (abbreviated)

<details>
<summary>Rows 1–5 — Aviludo multi-unit (all C)</summary>

**Anchoas (May & April), Gema (May & April), Atum:** Invoice multi-`un` lines with per-item unit price. Bound totals preserved. UI Last Purchase matches invoice qty; usable = qty × unit weight; operational cost = total ÷ usable kg/L. Stored `purchase_quantity=1` is not shown on detail card.

</details>

<details>
<summary>Rows 6–8 — Bocconcino</summary>

- **Mozzarella fior di latte (A):** 10×1 kg packs → UI 1 kg usable.
- **Stracciatella (C):** 24×250 g → 6 kg ✓.
- **Mezzi (A):** 2 cases → UI 6 kg not 12 kg.

</details>

<details>
<summary>Rows 9–13 — Cases & Emporio (mostly C)</summary>

- **Pomodori, S.Pellegrino×2, Paccheri (C):** Case expansion correct.
- **Ricotta (C):** Family A but UI economics match 2×1.5 kg purchase.

</details>

<details>
<summary>Rows 14–19 — Mammafiore</summary>

- **Ginger beer (A):** Volume parse failure.
- **Guanciale (A):** Weight line vs pack notation.
- **Peroni, Aceto, Mozzarella julienne, Rulo (C):** All math checks out.

</details>

---

## Artefacts

| File | Description |
|------|-------------|
| `.tmp/quantity-mismatch-ui-audit/classifications.json` | Per-row A/B/C with reasons |
| `.tmp/quantity-mismatch-ui-audit/replay.json` | Full production-path replay output |
| `.tmp/quantity-mismatch-ui-audit/audit.mts` | Reproducible read-only script |
| `.tmp/quantity-mismatch-validation/mismatches.json` | Source mismatch set |
| `.tmp/quantity-mismatch-validation/REPORT.md` | Prior quantity scan report |

## Code references

- `resolveCountablePurchaseQuantityForCost` — `src/lib/invoice-purchase-price-semantics.ts:587`
- `computeEffectiveUsableCost` — `src/lib/invoice-purchase-price-semantics.ts:516`
- `formatRowPurchaseQuantityLabel` — `src/lib/invoice-purchase-price-semantics.ts:768`
- `buildLastPurchaseCostPresentation` — `src/lib/ingredient-detail-panel.ts:299`
- Ingredient detail UI — `src/components/ingredient-detail-operational-layout.tsx:771`
