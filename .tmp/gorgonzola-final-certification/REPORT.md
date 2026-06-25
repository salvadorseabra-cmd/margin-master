# Gorgonzola Final Certification Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia, 19 May 2026)  
**Current item:** `5fab58a8-8cfc-4625-ab97-e956d07aade9`  
**Ingredient:** `1526106c-7bac-4b70-bd51-7b0fd5cc89ed` — Gorgonzola DOP dolce  
**Mode:** READ-ONLY certification · **Queried:** 2026-06-25T11:26Z (live VL Supabase)  
**Evidence:** `.tmp/gorgonzola-final-certification/results.json`, prior `.tmp/gorgonzola-*` audits

---

## Certification Decision

### 🟡 CONDITIONALLY CERTIFIED

Gorgonzola’s **extraction economics are correct and internally consistent** end-to-end after the 2026-06-25 re-extract (`1.35 kg × €9.95 = €13.44`, matching PDF). Catalog, recipe denominator, and price history are synced to **€9.95/kg**.

**Blocking conditions for full 🟢 closure:**

1. **Matching read path** — `invoice_item_matches` row is `confirmed`, but default UI/validation resolution (virtual matcher, `VITE_MATCH_LIFECYCLE_READ_CUTOVER` **off**) still yields `displayState: unmatched` → `UNMATCHED_INGREDIENT` finding.
2. **OCR stage trace** — No per-stage artifact from the final 2026-06-25 re-extract; convergence is proven at persistence only. Historical GPT variance at Pass C remains documented.
3. **Price history delta** — Single history row updated in place (`new_price` 0.00995 €/g); `previous_price` / `delta` remain null (no audit trail of 10.88 → 9.95 correction).

---

## Checklist Summary

| # | Stage | Verdict | Notes |
|---|--------|---------|-------|
| 1 | PDF Ground Truth | **PASS** | 1.35 kg · gross €12.90 · disc 22.85% · net €9.95 · total €13.44 |
| 2 | OCR Pipeline Trace | **PARTIAL** | End-state matches PDF; no fresh OCR→Pre-pass→Pass C→Final stage log for 2026-06-25 run |
| 3 | Persisted Data | **PASS** | Single Gorgonzola row `5fab58a8`: 1.35 / 9.95 / 13.44 kg |
| 4 | Purchase Economics | **PASS** | 1.35 × 9.95 = 13.4325 ≈ 13.44 (0.06% gap) |
| 5 | Operational Economics | **PASS** | Procurement = Operational = **€9.95/kg** (kg-row collapse); usable 1.5 kg from pack name |
| 6 | Ingredient Catalog | **PASS** | `current_price` 9.95 · `purchase_quantity` 1000 g · updated 2026-06-25 |
| 7 | Price History | **PASS*** | Latest 0.00995 €/g ↔ 9.95/1000; *delta fields empty |
| 8 | Matching | **FAIL** | DB confirmed; virtual read path unmatched (alias/cutover gap) |
| 9 | Validation Engine | **PARTIAL** | Math/extraction/operational **[]**; matching emits `UNMATCHED_INGREDIENT` on default path |
| 10 | UI Consistency | **PARTIAL** | Economics identical across presentation replay; match badge shows **Unmatched** without read cutover |
| 11 | Single Source of Truth | **PARTIAL** | PDF → invoice_items → catalog → economics → **YES**; matching/validation display → **NO** |

---

## Evidence Table

| Field | PDF (ground truth) | Live VL `invoice_items` | Ingredient catalog | UI presentation replay |
|-------|-------------------|---------------------------|---------------------|------------------------|
| Product | Arrigoni … Castelregio 1/8 ~1,5kg | Arrigoni … Castelfrigo 1/8 - 1,5kg | Gorgonzola DOP dolce | Same as invoice line |
| Quantity | **1.35** kg | **1.35** kg | — | **1.35 kg** (Last Purchase label) |
| Gross unit | €12.90 | — (not stored) | — | — |
| Discount | 22.85% | — (not stored) | — | — |
| Net unit price | **€9.95** | **€9.95** | **9.95** (€/priced kg) | **€9.95 / kg** |
| Line total | **€13.44** | **€13.44** | — | **€13.43** display (rounding) |
| Usable (pack) | ~1.5 kg | — | purchase_qty 1000 g | **1.5 kg usable** |
| Operational €/kg | €9.95 (net list) | — | 9.95 / 1000 g | **€9.95 / kg** |
| Match | Gorgonzola DOP dolce | `invoice_item_matches`: **confirmed** | Alias confirmed | Virtual: **unmatched** |

**Math reconciliation (live):**

| Expression | Result | vs total €13.44 |
|------------|--------|-----------------|
| 1.35 × 9.95 | 13.4325 | €0.0075 (0.06%) |
| 13.44 ÷ 1.35 | 9.9556 €/kg | aligns with net €9.95 |

---

## Stage-by-Stage Detail

### 1 — PDF Ground Truth

Source: `.tmp/gorgonzola-root-cause/stage-trace.json` `visibleInvoice`

| Field | Value |
|-------|-------|
| Qty | 1.35 kg |
| Gross unit | €12.90 |
| Discount | 22.85% |
| Net unit (implied) | €9.95 |
| Line total | €13.44 |
| Check | 1.35 × 12.90 × (1 − 0.2285) ≈ 13.44 ✓ |

### 2 — OCR Pipeline Trace

| Stage | Qty | Unit price | Total | Reconciles? | Source |
|-------|-----|------------|-------|-------------|--------|
| PDF | 1.35 | 9.95 (net) | 13.44 | YES | stage-trace.json |
| Pre-pass (v41, prior) | 1.30 | 9.88 | 13.44 | NO | final-gorgonzola-validation |
| Pass C (historical) | 1.05–2.00 | 9.35–10.88 | 13.44–18.72 | varies | persistence / reread audits |
| **Persisted (2026-06-25)** | **1.35** | **9.95** | **13.44** | **YES** | live VL `5fab58a8` |
| bindMonetaryColumns (PDF structured) | 1.35 | 9.95 | 13.44 | YES | results.json `pdfBound` |
| bindMonetaryColumns (DB as-is) | 1.35 | 9.95 | 13.44 | YES | results.json `dbBound` |

**Convergence:** Final persisted trio equals PDF-bound output. **Gap:** No stored OCR/Pre-pass/Pass C JSON from the 2026-06-25T01:55:43 insert; cannot certify intermediate stages for this run.

### 3 — Persisted Data

```json
{
  "id": "5fab58a8-8cfc-4625-ab97-e956d07aade9",
  "quantity": 1.35,
  "unit": "kg",
  "unit_price": 9.95,
  "total": 13.44,
  "created_at": "2026-06-25T01:55:43.273848+00:00"
}
```

- Only **one** Gorgonzola `invoice_items` row in VL (prior stale rows removed).
- Prior rows (`bece238e` 1.05/10.88, `091d5bc2` 2/9.35, `fd785aba` 1.30/9.88) superseded.

### 4 — Purchase Economics

`qty × unit_price = total` within tolerance: **PASS** (0.06%).

### 5 — Operational Economics

| Concept | Value | Source |
|---------|-------|--------|
| Billed qty | 1.35 kg | invoice_items |
| Pack usable | 1500 g (1.5 kg) | `parsePurchaseStructureFromText` → `1,5kg` |
| Procurement | €9.95 / kg | `resolveInvoiceLinePricingPresentation.priceDisplay` |
| Operational | €9.95 / kg | kg-row collapse (`effectiveUsableCostLabel`) |
| Recipe denominator | 1000 g @ 9.95 | `recipeOperationalCostFieldsFromInvoiceLine` |

**Procurement = Operational for kg row:** **YES** (corrected row; previously failed at 1.05/10.88).

### 6 — Ingredient Catalog

| Field | Value | From latest invoice? |
|-------|-------|----------------------|
| current_price | 9.95 | YES (updated 2026-06-25T01:55:44Z) |
| purchase_quantity | 1000 | YES (g, kg short-circuit) |
| purchase_unit | g | YES |
| supplier | null | unchanged |
| normalized_name | gorgonzola dop dolce | — |

`operationalCostFieldsFromInvoiceLine` → catalog: **synced** (`catalogPriceSync: true`).

### 7 — Price History

| created_at | new_price (€/g) | €/kg | invoice_id | previous_price |
|------------|-----------------|------|------------|----------------|
| 2026-05-19T12:00:00Z | 0.00995 | €9.95/kg | ab52796d… | null |

- Latest row matches `current_price` / 1000: **YES**
- Orphan/stale rows: **none**
- **Minor:** In-place update from prior 0.01022 (€10.88/kg) left `previous_price` and `delta` null

### 8 — Matching

| Layer | State | Detail |
|-------|-------|--------|
| `invoice_item_matches` | **confirmed** | `match_kind: confirmed-override`, created 2026-06-25T01:55:47Z |
| `ingredient_aliases` | **confirmed** | Emporio Italia alias for exact line name |
| Virtual matcher | **miss** | `resolveInvoiceTableRowIngredientMatch` → `displayState: unmatched` |
| Read cutover | **off** | `VITE_MATCH_LIFECYCLE_READ_CUTOVER` default false; persisted map not applied on read |

**Ambiguity:** None at catalog level (single Gorgonzola canonical). **Read-path gap:** persisted confirmation not surfaced without cutover flag or virtual alias hit.

### 9 — Validation Engine

`validateInvoiceLine()` with wired `matchDisplayState` (default virtual path):

| Validator | Expected | Actual | Why |
|-----------|----------|--------|-----|
| Extraction | [] | [] | Name present; qty/unit/price/total populated |
| Mathematics | [] | [] | 1.35×9.95≈13.44; below €0.50 / 5% thresholds |
| Operational | [] | [] | Billed kg economics reconcile; no Guanciale-style pack/qty split |
| Matching | [] if confirmed | **`UNMATCHED_INGREDIENT`** | `matchDisplayState: unmatched` from virtual matcher |

With `matchDisplayState: confirmed` (read cutover on): **all validators → []**.

### 10 — UI Consistency

Replayed via `resolveInvoiceLinePricingPresentation` (shared by Invoice Review + `resolvePurchaseCostLabels` for Ingredient Detail / Purchase History):

| Surface | Qty | Procurement | Operational | Total |
|---------|-----|-------------|-------------|-------|
| Invoice Review card | 1.35 kg | €9.95 / kg | €9.95 / kg | €13.43 (display) |
| Ingredient Detail KPI | — | €9.95 / kg | €9.95 / kg | €13.44 |
| Ingredient Costs (recipe) | per 1000 g | 9.95 | 9.95 | — |
| Match badge | — | — | — | **Unmatched** (default path) |

**Economics: identical.** **Match display: inconsistent** with persisted `invoice_item_matches`.

### 11 — Single Source of Truth

| Chain | Consistent? |
|-------|-------------|
| PDF → invoice_items (qty, net price, total) | **YES** |
| invoice_items → catalog `current_price` | **YES** |
| invoice_items → recipe operational fields | **YES** |
| invoice_items → price history latest | **YES** |
| invoice_items → validation (math) | **YES** |
| invoice_items → UI economics | **YES** |
| invoice_items → match display / validation (matching) | **NO** (without read cutover) |

**Overall SSOT:** **PARTIAL**

---

## Historical Context (superseded states)

| Date / item | Trio | Status |
|-------------|------|--------|
| bece238e (2026-06-23) | 1.05 / 10.88 / 13.44 | Wrong qty & price; math broken |
| 091d5bc2 (re-read) | 2.00 / 9.35 / 18.72 | Math-consistent but wrong vs PDF |
| fd785aba (v41) | 1.30 / 9.88 / 13.44 | Closer; still wrong qty |
| **5fab58a8 (2026-06-25)** | **1.35 / 9.95 / 13.44** | **PDF-aligned** |

---

## Remaining Issues

1. **Match lifecycle read cutover** — Persisted `confirmed` match invisible in Invoice Review / validation until `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` or virtual alias resolution fixed for this line.
2. **Acceptance-test script column** — `.tmp/validation-findings-acceptance-test/replay.mts` queries `match_state` (nonexistent); should use `status`, causing false `UNMATCHED` in that audit artifact.
3. **OCR re-extract stability** — No proof the 1.35/9.95/13.44 triple survives N re-invokes; Emporio fractional-kg GPT variance documented (60% stability in deli audit).
4. **Gross/discount not persisted** — Schema stores net unit only; discount column recovery still session/extraction-dependent.
5. **Price history audit trail** — Correction from €10.88 → €9.95 not reflected in `previous_price` / `delta`.

---

## Recommendation

| Action | Priority |
|--------|----------|
| Enable read cutover in VL (or fix virtual alias hit for Castelfrigo line) | **P0** for 🟢 |
| Re-run 5× extract-invoice stability on Gorgonzola | **P1** before permanent regression |
| Capture stage trace JSON on next certified re-extract | **P1** for OCR stage sign-off |
| Backfill price history delta on correction | **P2** |
| Fix acceptance-test `match_state` → `status` | **P2** (audit hygiene) |

**Can Gorgonzola become a permanent regression test?**  
**Yes** — as the canonical Emporio fractional-kg + discount-row anchor (`1.35 / €9.95 / €13.44`), **after** matching read path is fixed and at least one multi-run stability probe is archived.

**Confidence:** **82%** — high on live economics/catalog sync; reduced by matching read gap, missing OCR stage artifact, and historical GPT variance.

---

## Return to Parent

1. **Certification:** 🟡 **CONDITIONALLY CERTIFIED**
2. **Checklist:** 7 PASS · 3 PARTIAL · 1 FAIL (matching)
3. **Remaining issues:** Match read cutover / virtual alias; OCR stage trace gap; re-extract stability unproven; price history delta null
4. **Permanent regression test:** **Yes** (with P0/P1 gates above)
5. **Confidence:** **82%**
