# Family A Impact Analysis — READ-ONLY

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Counterfactual:** Extraction quantity **2 → 1** at Hybrid H source (v25 extract); line totals held constant  
**Method:** VL read-only SELECT + production replay (`bindMonetaryColumns` → `resolveInvoiceLinePurchaseFormat` → `resolveCountablePurchaseQuantityForCost` → `computeEffectiveUsableCost` → `procurementPackFieldsFromInvoiceLine` → `operationalUnitPriceForPriceHistory`)

**Classification key:** **A** Must change · **B** Should not change · **C** Requires validation

---

## Executive summary

| Product | Lines that must change | Lines unchanged | Distinct profile |
|---------|----------------------:|----------------:|------------------|
| Ricotta trevigiana | **15** | 8 | Full economics shift: usable 3 kg→1.5 kg, op cost €2.66→€5.31/kg |
| Mezzi paccheri mancini | **12** | 11 | Split-brain fix: procurement/qty align to PDF; usable/op €/kg already correct |

**Invoice header total:** €290.64 — **unchanged** (B). Only per-line unit economics change.

**Other ingredients affected:** **None.** Correction is line-local; five sibling lines on the same invoice are independent.

---

## 1. RICOTTA TREVIGIANA 1,5KG

**IDs:** invoice item `409850ab-646d-44fa-b20c-c8a4a8570064` · ingredient `6ec0bc6b-409a-4db2-b21f-fb01394f0014`  
**PDF truth:** 1 unit × €7.967 = €7.97 (1.5 kg usable)  
**Current (qty=2 at extraction):** bound 2 × €3.99 = €7.97 · 3 kg usable · €2.66/kg

### invoice_items

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| quantity | 2 | 1 | −1 | **A** |
| unit_price (persisted pre-bind) | 7.97 | 7.967 | −0.003 | **A** |
| total | 7.97 | 7.97 | 0 | **B** |
| unit | un | uni | — | **B** |
| bound.unit_price (post-bind) | 3.99 | 7.967 | +3.977 | **A** |

*Evidence:* VL `invoice_items` SELECT 2026-06-22; `.tmp/phase1-validation-forensics-result.json` `binding_qty1_vs_qty2`; `.tmp/ricotta-root-cause-trace/trace.json` stage 7.

### purchase history

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| Last Purchase quantity label | 2 un | 1 uni | — | **A** |
| Last Purchase unit price | €3.99 | €7.97 | +€3.98 | **A** |
| Last Purchase total | €7.97 | €7.97 | 0 | **B** |
| Procurement display | €3.99 / unit | €7.97 / unit | — | **A** |
| Operational display | €2.66 / kg | €5.31 / kg | +€2.65/kg | **A** |

*Evidence:* `.tmp/quantity-mismatch-ui-audit/replay.json` (item 409850ab…); production replay in `impact.json`.

### procurement cost

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (display) | 3.99 | 7.967 | +3.977 | **A** |
| purchase_quantity (catalog stored) | 2 | 1 | −1 | **A** |
| purchaseQtyForCost (Family A collapse) | 1 | 1 | 0 | **B** |
| catalog operational unit cost | 3.985 | 7.967 | +3.982 | **A** |

*Evidence:* `.tmp/historical-pricing-integrity-audit/per-ingredient/6ec0bc6b-409a-4db2-b21f-fb01394f0014.json` (catalog PQ=2, op=3.985); replay `impact.json`.

### operational cost

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (per priced unit) | 3.99 | 7.967 | +3.977 | **A** |
| usable_weight_grams (per unit) | 1500 | 1500 | 0 | **B** |
| effectiveUsableCost (€/kg) | 2.66 | 5.31 | +2.65 | **A** |
| cost unit | kg | kg | — | **B** |

*Expression:* current = €7.97 ÷ 3 kg; correct = €7.97 ÷ 1.5 kg.

### usable quantity

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| normalizedUsableQuantity (g) | 3000 | 1500 | −1500 | **A** |
| presentation label | 3 kg usable | 1.5 kg usable | — | **A** |
| purchaseContainerCount | 2 | 1 | −1 | **A** |

*Mechanism:* `weight_or_volume` line scales usable with invoice row quantity (`2 × 1.5 kg`).

### ingredient current_price

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (pack) | 7.97 | 7.967 | −0.003 | **A** |
| purchase_quantity | 2 | 1 | −1 | **A** |
| catalog operational €/unit | 3.985 | 7.967 | +3.982 | **A** |

*Evidence:* `.tmp/historical-pricing-integrity-audit/per-ingredient/6ec0bc6b-409a-4db2-b21f-fb01394f0014.json`; `syncOperationalIngredientCostsFromInvoiceLines` path in `src/routes/invoices.tsx`.

### ingredient_price_history

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| new_price (operational unit) | 3.985 | 7.967 | +3.982 | **A** |
| previous_price | null | null | — | **B** |
| invoice_id link | f0aa5a08… | f0aa5a08… | — | **B** |

*Note:* Single history row from this invoice; `operationalUnitPriceForPriceHistory` would store 7.967 not 3.985.

### opportunities

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| priceChangeSignal | none (first purchase) | none (first purchase) | — | **B** |
| shared_ingredient / recent_update | none | none | — | **B** |

*Rationale:* No prior `previous_price`; opportunity alerts require a baseline delta (`src/lib/margin-alert-data.ts`).

### alerts

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| quantityMismatch (Family A) | qty 2 vs PQ 1 | cleared / reduced | — | **A** |
| volatile_ingredient | unlikely (single row) | unlikely | — | **B** |

*Evidence:* `.tmp/quantity-mismatch-validation/mismatches.json` (Ricotta `familyA: true`, types `invoice_vs_stored_purchase_quantity`, `usable_implies_more_units_than_purchased`).

### dashboard metrics

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| recipe food cost (Ricotta lines) | n/a | n/a | — | **B** |
| recipe gross margin | n/a | n/a | — | **B** |

*Evidence:* VL `recipe_ingredients` SELECT — **no recipes reference** `6ec0bc6b-409a-4db2-b21f-fb01394f0014`. If recipes are added later, op cost +€2.65/kg would flow through `getRecipeMetrics` / `computeMarginDelta`.

### supplier metrics

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| line spend (Bocconcino) | 7.97 | 7.97 | 0 | **B** |
| avg unit price (persisted) | 7.97 | 7.967 | −0.003 | **A** |
| invoice header total | 290.64 | 290.64 | 0 | **B** |

---

## 2. MEZZI PACCHERI MANCINI (CX 1KG*6)

**IDs:** invoice item `bb4bbfac-a59b-4d0b-9844-ba773c1f261e` · ingredient `6a7d0b80-764a-40e8-a3fb-9361e7d9ee98`  
**PDF truth:** 1 case × €27.30 = €27.30 (6 kg usable, €4.55/kg)  
**Current (qty=2 at extraction):** bound 2 × €13.65 = €27.30 · **split-brain:** Last Purchase 2 un but usable 6 kg (one case)

### invoice_items

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| quantity | 2 | 1 | −1 | **A** |
| unit_price (persisted pre-bind) | 27.31 | 27.30 | −0.01 | **A** |
| total | 27.30 | 27.30 | 0 | **B** |
| unit | un | uni | — | **B** |
| bound.unit_price (post-bind) | 13.65 | 27.30 | +13.65 | **A** |

*Evidence:* `.tmp/mezzi-root-cause-trace/trace.json` stage 7; VL SELECT 2026-06-22.

### purchase history

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| Last Purchase quantity label | 2 un | 1 uni | — | **A** |
| Last Purchase unit price | €13.65 | €27.30 | +€13.65 | **A** |
| Last Purchase total | €27.30 | €27.30 | 0 | **B** |
| Procurement display | €13.65 / case | €27.30 / case | — | **A** |
| Operational display | €4.55 / kg | €4.55 / kg | 0 | **B** |

*Split-brain resolution:* correcting qty aligns Last Purchase (1 case) with usable (6 kg). Currently user sees 2 un + 6 kg — contradictory.

### procurement cost

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (display) | 13.65 | 27.30 | +13.65 | **A** |
| purchase_quantity (catalog stored) | 2 | 1 | −1 | **A** |
| purchaseQtyForCost (Family A collapse) | 1 | 1 | 0 | **B** |
| catalog operational unit cost | 13.655 | 27.30 | +13.645 | **A** |

*Evidence:* `.tmp/historical-pricing-integrity-audit/per-ingredient/6a7d0b80-764a-40e8-a3fb-9361e7d9ee98.json`.

### operational cost

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (per priced unit) | 13.65 | 27.30 | +13.65 | **A** |
| usable_weight_grams (per unit) | 6000 | 6000 | 0 | **B** |
| effectiveUsableCost (€/kg) | 4.55 | 4.55 | 0 | **B** |
| cost unit | kg | kg | — | **B** |

*Mechanism:* `resolveCountablePurchaseQuantityForCost` → 1 case in **both** states; €27.30 ÷ 6 kg = €4.55/kg regardless of invoice qty fiction. Op €/kg was accidentally PDF-correct.

### usable quantity

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| normalizedUsableQuantity (g) | 6000 | 6000 | 0 | **B** |
| presentation label | 6 kg usable | 6 kg usable | — | **B** |
| purchaseContainerCount | 6 | 6 | 0 | **B** |

*Mechanism:* `multi_unit_pack` `(CX 1KG*6)` + Family A collapse uses one-case volume regardless of invoice qty=2.

### ingredient current_price

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| current_price (pack) | 27.31 | 27.30 | −0.01 | **A** |
| purchase_quantity | 2 | 1 | −1 | **A** |
| catalog operational €/unit | 13.655 | 27.30 | +13.645 | **A** |

### ingredient_price_history

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| new_price (operational unit) | 13.655 | 27.30 | +13.645 | **A** |
| previous_price | null | null | — | **B** |

### opportunities

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| priceChangeSignal | none (first purchase) | none (first purchase) | — | **B** |

### alerts

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| quantityMismatch (Family A + split-brain) | active | cleared / reduced | — | **A** |
| UI bug classification | A — Confirmed Bug | C — Operationally Correct | — | **A** |

*Evidence:* `.tmp/quantity-mismatch-ui-audit/REPORT.md` row 8 (Mezzi class A under bound qty=2 fiction); against PDF qty=1, usable/op were already correct but Last Purchase was wrong.

### dashboard metrics

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|---------|------------------|-------|:-----:|
| recipe food cost | n/a | n/a | — | **B** |

*Evidence:* No `recipe_ingredients` rows for `6a7d0b80-764a-40e8-a3fb-9361e7d9ee98`.

### supplier metrics

| Field | Current | Correct if qty=1 | Delta | Class |
|-------|--------:|-----------------:|------:|:-----:|
| line spend | 27.30 | 27.30 | 0 | **B** |
| avg unit price (persisted) | 27.31 | 27.30 | −0.01 | **A** |
| invoice header total | 290.64 | 290.64 | 0 | **B** |

---

## 3. Ricotta vs Mezzi — differential impact

| Downstream surface | Ricotta (weight_or_volume) | Mezzi (multi_unit_pack) |
|--------------------|:--------------------------:|:-----------------------:|
| invoice_items.qty | **A** 2→1 | **A** 2→1 |
| bound unit_price | **A** €3.99→€7.97 | **A** €13.65→€27.30 |
| line total | **B** | **B** |
| usable quantity | **A** 3 kg→1.5 kg | **B** 6 kg (unchanged) |
| operational €/kg | **A** €2.66→€5.31 | **B** €4.55 (unchanged) |
| Last Purchase qty label | **A** 2→1 | **A** 2→1 |
| procurement €/case | **A** halved→doubled | **A** halved→doubled |
| split-brain UI | none (internally consistent with qty=2 fiction) | **resolved** (2 un vs 6 kg → 1 uni vs 6 kg) |
| recipe impact | **B** (no refs) | **B** (no refs) |

**Same root cause** (Hybrid H qty 1→2, stage 4). **Different downstream profile** because Mezzi Family A collapse decouples usable from invoice qty; Ricotta scales usable with row qty.

---

## 4. Other ingredients affected?

| Check | Result |
|-------|--------|
| Sibling lines on f0aa5a08… | Mozzarella, Stracciatella, Pomodori, S.Pellegrino, Rolo — **no change** |
| Shared supplier rollup | Invoice total unchanged; only Bocconcino per-line avg unit prices for Ricotta/Mezzi |
| Cross-ingredient alias | **None** |
| Recipe graph spillover | **None** (no recipe references to either ingredient) |
| Opportunity alerts on other SKUs | **None** |

**Conclusion:** Only Ricotta trevigiana and Mezzi paccheri mancini are affected. No other ingredient requires correction from this qty fix.

---

## 5. Requires validation (C)

| Field | Product | Why |
|-------|---------|-----|
| `ingredients.purchase_quantity` persist path | Ricotta | Catalog may store invoice qty (2) while `purchaseQtyForCost` collapses to 1; re-ingest must confirm which field wins on write |
| `ingredients.current_price` gross vs bound | Both | Persistence stores pre-bind gross (7.97 / 27.31); display uses post-bind (3.99 / 13.65). Qty=1 may align persisted and bound values |
| Unit normalization `un` vs `uni` | Both | Cosmetic; normalize on persist |
| Re-ingest without full replay | Both | **C** — manual row edit vs re-extract may diverge on `ingredient_price_history` row replacement |

---

## Artefacts

| File | Role |
|------|------|
| `.tmp/family-a-impact-analysis/impact.json` | Machine-readable field matrix + replay payloads |
| `.tmp/family-a-impact-analysis/impact.mts` | Reproducible read-only script |
| `.tmp/ricotta-root-cause-trace/` | Stage trace Ricotta |
| `.tmp/mezzi-root-cause-trace/` | Stage trace Mezzi |
| `.tmp/phase1-validation-forensics-result.json` | qty=1 vs qty=2 binding comparison |
| `.tmp/quantity-mismatch-ui-audit/` | UI replay + A/B/C classifications |
| `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` | v25 Hybrid H source (qty=2) |
| `.tmp/historical-pricing-integrity-audit/per-ingredient/` | Catalog + history ground truth |

**No code changes. No DB writes. No deployments.**
