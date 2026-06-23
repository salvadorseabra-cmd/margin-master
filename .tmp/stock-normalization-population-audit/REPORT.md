# Stock-Normalization Population Audit

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no fixes, no deployments

---

## Executive Summary

Live replay of `parsePurchaseStructureFromText` + `resolveInvoiceLinePurchaseFormat` on all **51 VL invoice_items** (7 invoices, 6 persisted + 1 extract-only) yields **48 products** in the purchase-structure population. **9** share the Mozzarella/Guanciale `SIZE_COUNT_RE` code path (`structureTotalIsFinalForGenericRow`). **4** are proven user-visible incorrect (Mozzarella, Mezzi paccheri, Guanciale, Ginger beer). **CAIXA_UNITS_SIZE_RE** matches **0** VL rows — `CX … *N` lines resolve via `SIZE_COUNT_RE` first.

**Confidence: High (0.91)**

---

## TASK 1 — Population by Parser Tier

### SIZE_COUNT_RE (9 products)

| Ingredient | Invoice |
|------------|---------|
| Mozzarella fior di latte | Il Bocconcino Distribuição Alimentar |
| Mezzi paccheri mancini | Il Bocconcino Distribuição Alimentar |
| Pomodori pelati | Il Bocconcino Distribuição Alimentar |
| Água san pellegrino | Il Bocconcino Distribuição Alimentar |
| Água san pellegrino | Emporio Italia, Lda. |
| Guanciale stagionato | Mammafiore Portugal |
| Peroni nastro azzurro 33cl | Mammafiore Portugal |
| Aceto balsamico di modena IGP | Mammafiore Portugal |
| Rulo di capra | Mammafiore Portugal |

### CAIXA_UNITS_SIZE_RE (0 products)

No VL row resolves to `caixa_units_size` or `caixa_compact_size`. Lines with `CX` prefix (e.g. `MEZZI PACCHERI MANCINI (CX 1KG*6)`) are captured earlier by `SIZE_COUNT_RE` (`1KG*6`).

### bare_measure (21 products)

**Matched ingredients (11):** Anchoas ×2, Atum em óleo, Gema líquida ×2, Ginger beer, Mozzarella julienne, Paccheri lisci, Ricotta trevigiana, Stracciatella

**Unmatched lines (10):** Various weight/volume single-pack lines across Avijudo, Aviludo, Bidfood, Emporio Italia, Il Bocconcino, Mammafiore

### weight_based (8 products)

No regex structure match; usable derived from row weight semantics (Bidfood meat lines ×7, Mammafiore 25 kg line). All **C — not yet validated**.

### volume_based (0 products)

No VL row assigned primary tier `volume_based`. Volume products with explicit `*N` notation (S.Pellegrino, Peroni, Aceto) land in `SIZE_COUNT_RE`; Ginger beer lands in `bare_measure` (`0.20cl` decimal typo).

### package_based (10 products)

Container/count-size structures (`container_size`, `count_size`, `units_size`) — Avijudo/Aviludo duplicate invoice lines (5 per supplier). All **C — not yet validated**.

### Excluded from population (3 items)

Lines with no purchase-structure parse and no usable stock from structure pipeline (generic count-only names, no embedded measure).

---

## TASK 2 — Full Inventory Table

| Ingredient | Invoice | Parser Tier | Purchase Qty | Parsed Structure | Usable Qty |
|------------|---------|-------------|-------------:|------------------|------------|
| Aceto balsamico di modena IGP | Mammafiore Portugal | SIZE_COUNT_RE | 1 | size_count [5l*2] → 2×5L = 10000ml | 10.00 L |
| Água san pellegrino | Il Bocconcino Distribuição Alimentar | SIZE_COUNT_RE | 2 | size_count [75CL*15] → 15×75cl = 11250ml | 11.25 L |
| Água san pellegrino | Emporio Italia, Lda. | SIZE_COUNT_RE | 2 | size_count [75cl x 15ud] → 15×75cl = 11250ml | 11.25 L |
| Guanciale stagionato | Mammafiore Portugal | SIZE_COUNT_RE | 5.996 | size_count [1,5kg*7] → 7×1.5kg = 10500g | 10.5 kg |
| Mezzi paccheri mancini | Il Bocconcino Distribuição Alimentar | SIZE_COUNT_RE | 2 | size_count [1KG*6] → 6×1kg = 6000g | 6 kg |
| Mozzarella fior di latte | Il Bocconcino Distribuição Alimentar | SIZE_COUNT_RE | 10 | size_count [125GR*8] → 8×125g = 1000g | 1 kg |
| Peroni nastro azzurro 33cl | Mammafiore Portugal | SIZE_COUNT_RE | 24 | size_count [33cl*24] → 24×33cl = 7920ml | 7.92 L |
| Pomodori pelati | Il Bocconcino Distribuição Alimentar | SIZE_COUNT_RE | 1 | size_count [2,5KG*6] → 6×2.5kg = 15000g | 15 kg |
| Rulo di capra | Mammafiore Portugal | SIZE_COUNT_RE | 1 | size_count [1kg*2] → 2×1kg = 2000g | 2 kg |
| Anchoas | Avijudo | bare_measure | 2 | bare_measure [495 g] → 495g = 495g | 990 g |
| Anchoas | Aviludo | bare_measure | 2 | bare_measure [495 g] → 495g = 495g | 990 g |
| Atum em óleo | Aviludo | bare_measure | 2 | bare_measure [1 Kg] → 1kg = 1000g | 2 kg |
| Gema líquida | Avijudo | bare_measure | 6 | bare_measure [1 Kg] → 1kg = 1000g | 6 kg |
| Gema líquida | Aviludo | bare_measure | 6 | bare_measure [1kg] → 1kg = 1000g | 6 kg |
| Ginger beer | Emporio Italia, Lda. | bare_measure | 24 | bare_measure [0.20cl] → 0.2cl = 2ml | 48 ml |
| Mozzarella julienne | Mammafiore Portugal | bare_measure | 10 | bare_measure [3kg] → 3kg = 3000g | 30 kg |
| Paccheri lisci | Emporio Italia, Lda. | bare_measure | 24 | bare_measure [500g] → 500g = 500g | 12 kg |
| Ricotta trevigiana | Il Bocconcino Distribuição Alimentar | bare_measure | 2 | bare_measure [1,5KG] → 1.5kg = 1500g | 3 kg |
| Stracciatella | Il Bocconcino Distribuição Alimentar | bare_measure | 24 | bare_measure [250 GR] → 250g = 250g | 6 kg |
| *(10 unmatched bare_measure lines)* | Avijudo / Aviludo / Bidfood / Emporio / Bocconcino / Mammafiore | bare_measure | 1–8 | single embedded g/kg/L measures | scaled by row qty |
| *(8 unmatched weight_based lines)* | Bidfood / Mammafiore | weight_based | 0.5–5.64 | — (no structure parse) | row-weight aligned |
| *(10 unmatched package_based lines)* | Avijudo / Aviludo | package_based | 1–5 | container_size / count_size | scaled by structure |

Full machine-readable rows: `.tmp/stock-normalization-population-audit/population.json`

---

## TASK 3 — Products Sharing Mozzarella / Guanciale Code Path

All **9** `SIZE_COUNT_RE` products traverse the identical downstream path documented in `.tmp/stock-normalization-family-assessment/`:

```
parsePurchaseStructureFromText (SIZE_COUNT_RE → tier: size_count)
  → purchaseStructureToPackPhrase (multi_unit_pack)
  → resolveStructurePurchaseQuantity (returns 1 for generic row)
  → computeUsableFromPurchaseStructure (structureTotalIsFinalForGenericRow)
  → resolveInvoiceLinePurchaseFormat
  → resolveCountablePurchaseQuantityForCost
```

| # | Ingredient | Line token | Shares path? |
|---|------------|------------|:------------:|
| 1 | Mozzarella fior di latte | 125GR*8 | **Yes** |
| 2 | Mezzi paccheri mancini | 1KG*6 | **Yes** |
| 3 | Pomodori pelati | 2,5KG*6 | **Yes** |
| 4 | Água san pellegrino (Bocconcino) | 75CL*15 | **Yes** |
| 5 | Água san pellegrino (Emporio) | 75cl x 15ud | **Yes** |
| 6 | Guanciale stagionato | 1,5kg*7 | **Yes** |
| 7 | Peroni nastro azzurro 33cl | 33cl*24 | **Yes** |
| 8 | Aceto balsamico di modena IGP | 5l*2 | **Yes** |
| 9 | Rulo di capra | 1kg*2 | **Yes** |

**Not on this path:** Stracciatella (bare_measure — control), Ginger beer (bare_measure decimal-cl), Ricotta (bare_measure + Family A extraction), all package_based / weight_based rows.

---

## TASK 4 — Validation Classification (Mozzarella/Guanciale Path)

| Ingredient | Validation | User-visible bug? | Evidence |
|------------|:----------:|:-----------------:|----------|
| Mozzarella fior di latte | **B — Proven incorrect** | Yes | quantity-mismatch-ui-audit class A; 1 kg vs 10 kg expected |
| Mezzi paccheri mancini | **B — Proven incorrect** | Yes | quantity-mismatch-ui-audit class A; 6 kg vs 12 kg (Family A + structure path) |
| Guanciale stagionato | **B — Proven incorrect** | Yes | quantity-mismatch-ui-audit class A; 10.5 kg vs ~6 kg |
| Pomodori pelati | **A — Proven correct** | No | qty=1; single-case structure total matches UI |
| Água san pellegrino (×2) | **A — Proven correct** | No | operational €/L correct despite internal PQ collapse |
| Peroni nastro azzurro 33cl | **A — Proven correct** | No | 24 bottles → 7.92 L correct |
| Aceto balsamico di modena IGP | **A — Proven correct** | No | 1 outer × 2×5 L → 10 L correct |
| Rulo di capra | **A — Proven correct** | No | 1 unit × 2×1 kg → 2 kg correct |

**Outside path but stock-normalization relevant:**

| Ingredient | Tier | Validation |
|------------|------|:----------:|
| Ginger beer | bare_measure | **B — Proven incorrect** (0.20cl → 2 ml/bottle) |
| Stracciatella | bare_measure | **A — Proven correct** (control) |
| Ricotta trevigiana | bare_measure | **A — Proven correct** (Family A, UI OK) |
| Anchoas, Gema, Atum, Mozzarella julienne, Paccheri lisci | bare_measure | **A — Proven correct** |
| 29 unmatched VL rows | bare_measure / weight_based / package_based | **C — Not yet validated** |

---

## TASK 5 — Parser Tier Summary

| Parser Tier | Product Count | Validated Correct | Validated Incorrect | Unknown |
|-------------|-------------:|------------------:|--------------------:|--------:|
| SIZE_COUNT_RE | 9 | 6 | 3 | 0 |
| CAIXA_UNITS_SIZE_RE | 0 | 0 | 0 | 0 |
| bare_measure | 21 | 9 | 1 | 11 |
| weight_based | 8 | 0 | 0 | 8 |
| volume_based | 0 | 0 | 0 | 0 |
| package_based | 10 | 0 | 0 | 10 |
| **Total population** | **48** | **15** | **4** | **29** |

**Notes:**
- "Validated" status sourced from `.tmp/quantity-mismatch-ui-audit/classifications.json` (19 matched-ingredient rows with UI replay).
- 29 unknown rows are unmatched invoice lines without prior UI audit coverage.
- Ginger beer incorrect count appears under `bare_measure`, not `volume_based`.

---

## TASK 6 — Blast Radius of Stock-Normalization Changes

### Direct code surface

| Function | File | VL rows touched |
|----------|------|----------------:|
| `parsePurchaseStructureFromText` | stock-normalization.ts | 48 |
| `computeUsableFromPurchaseStructure` | stock-normalization.ts | 48 |
| `structureTotalIsFinalForGenericRow` | stock-normalization.ts | **9** (SIZE_COUNT_RE only) |
| `resolveStructurePurchaseQuantity` | stock-normalization.ts | **9** |
| `normalizePurchasedToUsableStock` | stock-normalization.ts | 48 |
| `resolveInvoiceLinePurchaseFormat` | invoice-purchase-format.ts | 48 |

### Downstream consumers (all 48 population rows)

- `recipeOperationalCostFieldsFromInvoiceLine` → operational €/kg or €/L
- `computeEffectiveUsableCost` → ingredient detail economics card
- `resolveInvoiceLineStockPresentation` → usable quantity label
- `structuredPurchaseToIngredientFields` → catalog `purchase_quantity`, `usable_weight_grams`
- `syncOperationalIngredientCostsFromInvoiceLines` → re-ingest propagation

### Risk tiers if `structureTotalIsFinalForGenericRow` changes

| Risk | Scope | Products | Must-not-break |
|------|-------|----------|----------------|
| **Critical** | SIZE_COUNT_RE outer-pack rescaling | Mozzarella (fix target) | Pomodori, S.Pellegrino×2, Peroni, Aceto, Rulo |
| **High** | Weight-semantics decoupling | Guanciale | Do not flip to under-count |
| **Medium** | Family A interaction | Mezzi paccheri | Ricotta control (bare_measure) |
| **Low** | bare_measure row scaling | 21 rows | Stracciatella control |
| **Unknown** | package_based / weight_based | 18 rows | No validation baseline |

### User-visible impact today (proven incorrect = 4)

1. **Mozzarella** — usable 1 kg, op €81.20/kg (should 10 kg, €8.12/kg)
2. **Mezzi paccheri** — usable 6 kg (should 12 kg for 2 cases)
3. **Guanciale** — usable 10.5 kg (should ~6 kg)
4. **Ginger beer** — usable 48 ml, op €405/L (should ~4.8 L, ~€4/L)

### Change-isolation verdict

Per `.tmp/mozzarella-implementation-prep/readiness.json` and `.tmp/stock-normalization-family-assessment/`: Mozzarella fix is **VL-isolated** for user-visible bugs if rescaling is scoped to outer-pack count lines only. Blanket `SIZE_COUNT_RE` multiplication would **regress** 6 proven-correct products unless guarded. Guanciale requires a **separate** weight-semantics track.

---

## Methodology

1. Read-only `SELECT` on VL `invoice_items`, `invoices`, `invoice_item_ingredient_matches` (51 rows).
2. Production replay: `bindMonetaryColumns` → `parsePurchaseStructureFromText` → `normalizePurchasedToUsableStock` → `resolveInvoiceLinePurchaseFormat`.
3. Parser tier assignment: regex tier when structure parses; else semantic fallback (`weight_based` / `volume_based` / `package_based`).
4. Validation cross-reference: `.tmp/quantity-mismatch-ui-audit/classifications.json`, `.tmp/bug-pattern-expansion-audit/`, `.tmp/stock-normalization-family-assessment/`, `.tmp/mozzarella-implementation-prep/`.

---

## Confidence

| Aspect | Level | Score |
|--------|-------|------:|
| Population completeness (51 VL items) | High | 0.95 |
| Parser tier replay fidelity | High | 0.94 |
| Mozzarella/Guanciale path mapping | High | 0.92 |
| Validated correct/incorrect (19 matched rows) | High | 0.93 |
| Unmatched row validation (29 unknown) | Low | 0.40 |
| **Overall** | **High** | **0.91** |

**Residual uncertainty:**
- 29/48 population rows lack UI audit classification.
- `CAIXA_UNITS_SIZE_RE` may exist in production beyond VL corpus.
- Ginger beer failure is `bare_measure` decimal-cl, not a separate volume tier.
- Invoice `17aa3591` (Ginger beer source) exists in extracts but not VL DB.

---

## Artefacts

| File | Role |
|------|------|
| `.tmp/stock-normalization-population-audit/REPORT.md` | This report |
| `.tmp/stock-normalization-population-audit/population.json` | Machine-readable population + blast radius |
| `.tmp/stock-normalization-population-audit/audit.mts` | Reproducible read-only replay script |
