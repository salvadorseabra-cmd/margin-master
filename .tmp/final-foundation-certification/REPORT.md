# Marginly Validation Lab — Final End-to-End Foundation Certification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only replays** · **2026-06-25T13:55:00Z**

## Final Decision

### 🟡 FOUNDATION CONDITIONALLY CERTIFIED

Procurement → Operational → Recipe Costing is **production-ready for the majority of VL workloads** but does **not** meet the strict 12-recipe / 34-line / 0-failure bar due to one multipack recipe-layer defect (Ginger beer). Foundation economics are sound; remaining gaps are configuration, sync artifacts, and one match-lifecycle architectural gate.

| Metric | Value |
|--------|-------|
| Production-ready | **Partial** |
| Confidence | **72%** |
| Foundation blockers | **2** |
| Sync artifacts | **4** |
| Configuration issues | **2** |

---

## Phase 1 — Replay Results (Fresh)

| Script | Status | Notes |
|--------|--------|-------|
| `foundation-certification/audit.mts` | ✅ | 40 ingredients; 4🟢 / 29🟡 / 7🔴 |
| `failed-ingredient-certification/audit.mts` | ✅ | 7 re-evaluated → all 🟡; 4 genuine / 3 false failures |
| `foundation-final-closure/audit.mts` | ✅ | 1 architectural + 2 sync on Prosciutto/Ovo/Tomilho |
| `validation-findings-acceptance-test/replay.mts` | ✅ | 52 items, 38 findings (matching only); stale fixture IDs |
| `recipe-costing-foundation-certification/audit.mts` | ⚠️ CRASH | Null ingredient on prep line — E2E audit used instead |
| `end-to-end-recipe-certification/audit.mts` | ✅ | **12 recipes / 34 lines** executed |
| `resolve-operational-ingredient-cost.test.ts` | ✅ | 27/27 unit tests |

---

## Phase 2 — Pillar Validation

| Pillar | PASS/FAIL | Score | Fresh Evidence |
|--------|-----------|-------|----------------|
| **Procurement** | PASS | 🟢 | 51 invoice lines; qty×price≈total; Gorgonzola 1.35×9.95=13.44 ✓ |
| **Operational Normalization** | PASS | 🟢 | 37/40 pass op checks; multipack ml/g/kg paths deterministic |
| **Ingredient Catalog** | PARTIAL | 🟡 | Pack semantics by design; Ovo/Tomilho stale `purchase_quantity` |
| **Historical Pricing** | SYNC ARTIFACT | 🟡 | Pack-level `new_price` on Ovo/Tomilho; 12+ history drift rows; **not used in recipe path** |
| **Validation Engine** | PASS | 🟢 | No MATHEMATICAL_INCONSISTENCY on current rows; gorgonzola/guanciale fixed |
| **Matching** | CONFIG | 🟡 | Architecture ✓; `VITE_MATCH_LIFECYCLE_READ_CUTOVER` off → virtual≠persisted |
| **Recipe Costing** | FAIL | 🟡 | **11/12 recipes PASS, 33/34 lines PASS** — Ginger beer blocks 0-failure bar |

### Recipe Costing — Actual Execution

```
Recipes:  12   Lines: 34
PASS:     11   Lines PASS: 33
FAIL:      1   Lines FAIL:  1
Tolerance: €0.02 per line
Zero-failure bar: NOT MET
```

**Failed recipe:** `VL-E2E Multipack`

| Line | Issue |
|------|-------|
| Ginger beer × 6 `un` | Overlay `cost_base_unit=ml`; recipe expects per-bottle countable. Engine total €2.33 vs PDF €7.19. Line computes €4.86 but excluded from recipe summary. |

**Passed coverage:** kg/g, ml/L, countable `un`, prep/sub-recipe, charcuterie, salad, pizza, pasta, dessert, sandwich, weight produce.

---

## Phase 3 — UI Consistency (Data Path Replay)

E2E audit replays production UI stack:

1. `enrichRecipeLinesForOperationalCost`
2. `resolveRecipeLineOperationalCost`
3. `computeRecipePricingSummaryFromRecipe`
4. `buildTechnicalSheetIngredientsFromCostLines` (PDF)

**Result:** 33/34 lines — UI unit cost matches engine overlay. Ginger beer line shows €0.81/`un` in presentation but summary total omits it.

---

## Phase 4 — Source of Truth Chain

```
invoice_items
  → invoice_item_matches (confirmed)
  → operationalCostFieldsFromInvoiceLine
  → resolveOperationalIngredientCostFields (invoice overlay wins)
  → effectiveIngredientUnitCostEur
  → ingredientLineCostEur / computeRecipeTotalCostEur
```

| Property | Verified |
|----------|----------|
| Single operational source | ✅ Invoice overlay → catalog → embed |
| Never `ingredient_price_history` in recipe path | ✅ |
| Recalculation on price change | ✅ Gorgonzola +10% → Δ€0.0398 exact |

---

## Phase 5 — Issue Classification

### Foundation Blockers (2)

| # | Issue | Class | Smallest fix |
|---|-------|-------|--------------|
| 1 | Prosciutto: history from unconfirmed suggested match | Foundation blocker | Gate history on confirmed match; purge orphan `b0e17b8b` |
| 2 | Ginger beer multipack recipe total | Recipe-layer bug | Direct countable path when recipe unit=`un` and invoice unit_price is per-bottle |

### Sync Artifacts (4)

- Ovo classe M — history `new_price` at pack level (€38.44 vs €0.2136/egg)
- Tomilho — history `new_price` at pack level (€2.06 vs €0.0206/g)
- Aviludo April→May — 12 ingredients with history delta drift
- Aceto/Ginger/Peroni — catalog not refreshed to latest discount economics (line totals correct)

### Configuration (2)

- `VITE_MATCH_LIFECYCLE_READ_CUTOVER` off — 26/40 ingredients show virtual≠persisted
- Validation-findings acceptance fixtures use stale invoice item IDs (post re-extract)

### Future Improvements

- Canonical Ingredient Identity (alias normalization)
- Discount-aware monetary binding on re-extract
- Catalog `purchase_quantity` backfill for produce/multipack
- Operational `new_price` in `appendIngredientPriceHistory`

---

## Phase 6 — Pillar Scores

| Pillar | Score |
|--------|-------|
| Procurement | 🟢 |
| Operational Normalization | 🟢 |
| Ingredient Catalog | 🟡 |
| Historical Pricing | 🟡 |
| Validation Engine | 🟢 |
| Matching | 🟡 |
| Recipe Costing | 🟡 |
| UI Consistency | 🟢 |
| Source of Truth | 🟢 |

---

## Cross-Certification Synthesis

| Audit | Decision | Key takeaway |
|-------|----------|--------------|
| Foundation | 🟡 Conditional | Economics pipeline consistent; match read-path + history drift |
| Failed-ingredient re-eval | 🟡 All 7 | 3 prior 🔴 were false failures (read-cutover + pack catalog semantics) |
| Foundation-final-closure | 🟡 Conditional | 1 architectural (Prosciutto), 2 sync (Ovo/Tomilho) |
| E2E Recipe | 🟡 Conditional | 92% recipe pass rate; multipack gap |
| Validation findings | ✅ Engine healthy | Prior math flags cleared after re-extract |

---

## Recommendation

**VL foundation work is substantially complete.** Before declaring 🟢:

1. Fix Ginger beer multipack recipe costing (direct countable when recipe uses `un`)
2. Enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER` in VL (or confirm matches in Invoice Review)
3. VL backfill: Ovo/Tomilho history `new_price`, Prosciutto orphan purge
4. Refresh validation-findings acceptance fixture IDs

**Product roadmap (post-certification):**

1. **Canonical Ingredient Identity** — durable alias + supplier binding
2. **Invoice ingestion** — discount binding, re-extract safety
3. **Recipe/Prep** — expand multipack/countable coverage, prep costing hardening

---

*Artifacts: `.tmp/final-foundation-certification/results.json`*
