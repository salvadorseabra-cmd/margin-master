# Ginger Beer Recipe Cost Resolution — Final Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **2026-06-25T13:33Z**  
**Mode:** STRICT READ-ONLY — no code, data, or DB changes

## Certification Question

Is Ginger Beer truly a **second bug**, or another manifestation of the same architectural decision as Manjericão/Salada?

**Answer: Yes — it is a second bug (different mechanism), but it shares the same architectural decision layer.**

| Aspect | Manjericão / Salada | Ginger Beer |
|--------|---------------------|-------------|
| Shared layer | `ingredientLineCostEur` fails after invoice overlay wins | Same |
| First divergence | `preferInvoiceCountableOverlayFields` corrupts `g` → `un` | Invoice `ml/200` wins over catalog `un/24` |
| `preferInvoiceCountableOverlayFields` | **Corrupts** (pq=100/250) | **Correct** (pq=200 preserved as ml) |
| Resolved base vs recipe | `un` vs `g` | `ml` vs `un` |
| Unit cost resolves? | Yes (€/g) | Yes (€/ml) |
| `lineCost` | null | null |

**Confidence:** 90%

---

## Phase 1 — Full Execution Trace (Ginger Beer)

**Recipe:** VL-E2E Multipack · 6 `un` · ingredient `7aa5dd9e…`

### Invoice → overlay

| Stage | Source | Fields |
|-------|--------|--------|
| `invoice_items` | Emporio Italia 2026-05-19 | `Baladin - Ginger Beer 0.20cl` · qty **24** · unit **un** · unit_price **€0.81** · total €19.38 |
| `operationalCostFieldsFromInvoiceLine` | Parser | `price=0.81, pq=200, base=ml` (200 ml/bottle from 20 cl parse) |
| `preferInvoiceCountableOverlayFields` | Normalization | **unchanged** `ml/200` (pq ∈ (1, 999) guard) |
| `mergeOperationalCostMetadata(catalog)` | Metadata merge | **unchanged** `ml/200` — `cost_base_unit` not merged from catalog |
| `resolveOperationalIngredientCostFields` | Source selection | **invoice** wins |

### Catalog (rejected for line costing)

| Field | Value |
|-------|-------|
| `current_price` | 0.81 |
| `purchase_quantity` | 24 |
| `cost_base_unit` | **un** |

### Resolution → line cost

| Step | Value |
|------|-------|
| `resolvedOperationalUnitCostEur` | **€0.00405/ml** (0.81 ÷ 200) — non-null |
| `effectiveIngredientUnitCostEur` | €0.00405/ml |
| `inferIngredientCostBaseUnit` | **ml** (volume family) |
| Recipe normalized | 6 **un** (countable family) |
| `directCountableLineCostEur` | **null** (`costBase !== "un"`) |
| `recipeLineCostViaPackagedLiquidConversion` | null (recipe not ml) |
| `recipeLineCostViaUsableConversion` | null (`costBase !== "un"`) |
| `recipeLineCostViaDensityConversion` | null (no density) |
| **`ingredientLineCostEur`** | **null** · `HYBRID_CONVERSION_MISSING` |

**Exact stop:** `src/lib/recipe-prep-cost.ts:336-338` — all conversion branches exhausted.

---

## Phase 2 — Decision Trace in `resolveOperationalIngredientCostFields`

| Candidate | Available | Selected | Why |
|-----------|-----------|----------|-----|
| **Invoice overlay** | ✓ | **✓** | Latest confirmed match; unconditional win at lines 242-250 |
| Catalog | ✓ | — | `un/24` rejected — price fields not used when invoice present |
| Embed | ✓ | — | Matches catalog; invoice takes precedence |
| `shouldPreferEmbedOverLegacyCatalogMassBase` | — | false | Catalog is `un`, not legacy mass |
| Fallback | — | — | — |

**`preferInvoiceCountableOverlayFields`:** not invoked for failure — ml base correctly preserved.

---

## Phase 3 — Unit-Family Analysis

| Dimension | Value | Family |
|-----------|-------|--------|
| Invoice overlay base | **ml** (pq=200 per bottle) | volume |
| Catalog base | **un** (pq=24 pack count) | countable |
| Recipe unit | **un** (6 bottles) | countable |
| Resolved base | **ml** | volume |
| Families compatible? | **No** | volume ≠ countable |

**Why conversion stops:**

1. Invoice parser encodes per-bottle volume (`ml/200`) from `0.20cl` in product name.
2. Invoice overlay wins per design — catalog `un` never reaches resolved fields.
3. `mergeOperationalCostMetadata` merges density/usable metadata but **not** `cost_base_unit`.
4. `directCountableLineCostEur` (`usable-unit-conversion.ts:311`) requires `costBase === "un"`.
5. No `usable_volume_ml` on merged fields to bridge volume-priced purchase → countable recipe.
6. `recipeLineCostViaUsableConversion` only runs when `costBase === "un"` and recipe is g/ml — wrong direction for `un` recipe.

---

## Phase 4 — Counter-Examples (first divergence from Ginger Beer)

| PASS | Recipe | Resolved base | Path | First divergence from Ginger Beer |
|------|--------|---------------|------|-----------------------------------|
| **Água san pellegrino** | 600 **ml** | ml (pq=11250) | `compatible_base_multiply` → €1.028 | Recipe uses **ml** — volume families match despite same invoice-ml overlay |
| **Arroz agulha** (same Multipack recipe) | 2 **un** | **un** | `direct_countable` → €2.325 | Invoice overlay is **un** — countable families match |
| **Anchoas** | 3 **un** | **un** | `direct_countable` → €29.97 | Same countable path |
| **Peroni** (unit test, not VL-E2E) | — | ml preserved (pq=330) | Operational €/L display | Same multipack beverage class; `preferInvoiceCountableOverlayFields` preserves ml when pq ∈ (1,999) |

**Key insight:** Acqua and Ginger Beer share the **same invoice overlay shape** (`ml` + large pq). Acqua PASSes because the recipe line is **ml**. Ginger FAILs because the recipe line is **un**.

---

## Phase 5 — Root Cause (A–E)

| Code | Verdict | Fit for Ginger Beer |
|------|---------|---------------------|
| **A overlay priority** | **Primary** | Invoice `ml/200` wins over catalog `un/24` |
| **B missing conversion** | **Contributing** | No ml→un / per-bottle countable bridge when recipe is `un` |
| C catalog persistence | No | Catalog has correct `un` base |
| D recipe resolver bug | Partial | `ingredientLineCostEur` ladder lacks multipack beverage bridge |
| E multiple causes | System-wide | Applies when grouping all 3 E2E FAILs; Ginger-specific is **A+B** |

**Selected for Ginger Beer: A** (overlay priority) with **B** as the conversion symptom.

**Not involved:** `preferInvoiceCountableOverlayFields` — the Manjericão/Salada corruption path.

---

## Phase 6 — Smallest Correction (DO NOT implement)

When **recipe unit is `un`**, **catalog `cost_base_unit` is `un`**, and **invoice overlay is `ml`** with per-piece volume (pq=200 ml/bottle):

**Option A (minimal):** In `resolveRecipeLineOperationalCost` / line-cost path, use catalog countable fields for `ingredientLineCostEur` when recipe unit family is countable and catalog base is `un` — keep invoice overlay for operational €/ml display only.

**Option B (bridge):** After invoice selection, set `usable_volume_ml: 200` from invoice pq when catalog is countable multipack; extend `directCountableLineCostEur` or add ml-priced→countable-recipe bridge.

**Do NOT** change `preferInvoiceCountableOverlayFields` for Ginger Beer — it correctly preserves `ml/200`.

**Expected line cost after fix:** 6 × €0.81/bottle = **€4.86** (invoice unit_price semantics).

---

## Regression Assessment

| Area | Risk | Notes |
|------|------|-------|
| Recipe costing | **High risk** | Line-cost source selection change |
| Invoice review | **Safe** | Does not use recipe line resolver |
| Ingredient costs UI | **Needs regression** | Operational €/ml display vs line €/un |
| Operational normalization | **Needs regression** | Peroni, mayo 450 ml, brioche paths |
| Validation engine | **Safe** | Read-only audits |
| Procurement | **Safe** | No dependency |
| History | **Safe** | Recipe path never reads history |
| Margin alerts | **Needs regression** | `margin-alert-data.ts` |

---

## Parent Agent Return

1. **Second bug?** **Yes** — same architectural layer as Manjericão/Salada, but **different mechanism** (invoice ml vs catalog un; not `preferInvoiceCountableOverlayFields` corruption).

2. **Exact root cause:** Invoice overlay `ml/200` wins over catalog `un/24`; `directCountableLineCostEur` requires `un` base; no ml→countable bridge for recipe `6 un`.

3. **Function + file + line:**
   - `resolveOperationalIngredientCostFields` — `src/lib/resolve-operational-ingredient-cost.ts:242-250`
   - `directCountableLineCostEur` guard — `src/lib/usable-unit-conversion.ts:311`
   - `ingredientLineCostEur` terminal null — `src/lib/recipe-prep-cost.ts:336-338`
   - **Not involved:** `preferInvoiceCountableOverlayFields:152-170`

4. **Smallest correction:** Use catalog `un` fields (or per-bottle `usable_volume_ml=200` bridge) for line costing when recipe unit is `un` and invoice overlay is per-bottle `ml`.

5. **If corrected (with Manjericão/Salada fix):** **12/12 PASS**, **34/34 PASS**, green certification.

6. **Confidence:** **90%**

---

## Evidence

- Audit script: `.tmp/ginger-beer-recipe-resolution/audit.mts`
- Results: `.tmp/ginger-beer-recipe-resolution/results.json`
- Prior audits: `.tmp/recipe-cost-resolution-audit/REPORT.md`, `.tmp/recipe-overlay-decision-audit/REPORT.md`
- E2E baseline: `.tmp/end-to-end-recipe-certification/REPORT.md` (Multipack FAIL)
