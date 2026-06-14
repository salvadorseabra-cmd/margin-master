# Ingredient Identity Architecture Audit

**Generated:** 2026-06-13  
**Mode:** READ-ONLY — codebase + VL artifacts + Supabase schema  
**No code changes, deploy, or commit.**

---

## Executive Summary

Marginly's ingredient identity model is **a single `ingredients` row per catalog entry**, with matching, aliases, price history, recipes, and supplier intelligence all keyed on **`ingredient_id`**. Rich canonicalization (family, form, operational families) runs **in memory at match time** but is **not persisted** as a pack-format contract.

This architecture is **insufficient** for trustworthy historical pricing, opportunities, and cross-supplier intelligence when the same ID absorbs **incompatible pack formats** or **product forms**. VL proves this with real data — not theoretical.

**Historical pricing math is sound** (per prior audit); **identity collapse poisons the inputs**.

---

## Final Question

### Is Ingredient Identity now the highest-leverage Marginly foundation problem remaining?

**YES — for foundation architecture (81% confidence).**

| Gap | Leverage | Why |
|-----|----------|-----|
| **Ingredient identity** | **Highest foundation** | Proven +1341% / −99.95% false movements; supplier intel and recipes share one `current_price` |
| Stale DB re-read | Highest *immediate* operational | Refreshes v31 data; does **not** fix pack-format collapse |
| Ginger Beer volume parse | Medium, narrow | Real bug for `0.20cl` beverages; orthogonal to ID schema |
| GT catalog (Pomodor) | Low (production) | Harness issue; extraction matches visible invoice |
| GPT variance tails | Diminishing | v31 closed structural families; low prompt ROI |

**Recommendation:** Ship a **cross-format history guard** immediately, then build a **pack-variant layer** under ingredient concepts. Run VL re-read in parallel for data freshness.

---

## Current Architecture

### Storage (persisted)

| Table | Role |
|-------|------|
| `ingredients` | Canonical row: `name`, `normalized_name`, `current_price`, `purchase_quantity`, `base_unit`, `ingredient_kind` |
| `ingredient_aliases` | `alias_name` → `ingredient_id` (+ supplier, confidence, confirmed_by_user) |
| `ingredient_price_history` | `ingredient_id` + `invoice_id` → operational `previous_price` / `new_price` |
| `recipe_ingredients` | `ingredient_id` XOR `sub_recipe_id` per recipe line |
| `invoice_items` | Raw extracted lines — **no persisted match FK**; match is runtime |

**Not in schema:** `pack_variant_id`, `sku_id`, `equivalence_group_id`, format contract on history rows.

### Reconstruction (runtime)

Matching pipeline (`findCanonicalIngredientMatch` in `ingredient-canonical.ts`):

1. User override (in-memory)
2. Operational alias memory
3. DB `ingredient_aliases`
4. Exact normalized name
5. Family-aware scoring (`ingredient-identity.ts`)
6. Semantic fallback

Auto-persist guards (`ingredient-auto-persist.ts`): duplicate normalized name, operational family conflict — but **not** "same cheese name, different pack."

### Price history chaining

`fetchPriorLinkedHistoryNewPrice` loads the latest **other-invoice** operational `new_price` for the same `ingredient_id` and uses it as `storedPrev` — **with no pack-format equivalence check** (`ingredient-price-history.ts`).

---

## Proven Identity Weaknesses (VL Evidence)

### 1. Mozzarella piece vs 2kg block — +1341% false inflation

| | Bocconcino | Aviludo April |
|---|------------|---------------|
| Line | `MOZZARELLA FIOR DI LATTE 'IL BOCCONCINO' 125GR*8` | `Mozzarella Flor di Latte 2Kg` |
| `ingredient_id` | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | same |
| Operational cost | €0.95/piece (pq=10) | €13.69/block (pq=1) |
| History | `new_price=0.95` (Bocconcino) | `previous=0.95 → new=13.69` (+1341%) |

**Root cause:** Token match on "mozzarella fior di latte" without pack-variant dimension. History chains piece-price to block-price as if comparable.

### 2. Pepino fresco vs conserva — −99.95% false deflation

| | Catalog / prior | Bidfood |
|---|-----------------|---------|
| Name | Pepino **conserva** | Pepino (fresh, kg) |
| `ingredient_id` | `635a1189-36ea-4ff2-9012-8172ab1ab81d` | same |
| Operational | ~€3.75/kg-op (jar) | €0.00177/g-op (€1.77/kg) |
| History delta | `3.748 → 0.00177` (−99.95%) | |

**Root cause:** Fresh vs preserved form not blocked at match. Per-row math is correct; **cross-product chain is invalid**.

### 3. Ginger Beer `0.20cl` — €575/L

- `0.20cl` parsed as 0.2 CL → 2 ml/bottle → €575/L usable cost
- Line **unmatched** — no SKU identity to disambiguate 20cl vs 33cl variants
- **Volume parse** is primary bug; identity gap compounds it

### 4. Alias / matching gap

- **46/51** VL invoice lines unmatched — history sync path never runs
- Aliases confirm wording → `ingredient_id` without pack metadata

---

## Impact by Feature

### Historical pricing & opportunities

- **INSUFFICIENT** — 6/20 history rows trusted; 3 proven opportunity errors
- Mechanism: `priceHistoryDeltaPct` on `ingredient_id` without format gate

### Supplier intelligence

- **INSUFFICIENT** — `buildSupplierIntelligence` compares latest vs 90d min/avg on same ID
- Mixed-format history → false spike and "better supplier" lines

### Purchase history

- **PARTIAL** — one row per `(invoice_id, ingredient_id)`; auditable per invoice, not per SKU
- 14 ghost rows from prior extraction lines

### Prep / sub-recipes

- **PARTIAL** — `sub_recipe_id` graph is clean
- Leaf `ingredient_id` rows share one `current_price` — last invoice overwrites pack economics for all recipes using that ID

---

## Canonicalization Risks

| Risk | VL evidence |
|------|---------------|
| `normalized_name` / token collision | Mozzarella |
| Form-blind matching (fresh vs preserved) | Pepino |
| Operational unit without pack context on history | Pepino chain |
| Alias confirms ambiguous ID | 46 unmatched lines |
| Cross-supplier equivalence assumed | Supplier intel on mixed history |
| Volume token in name (not identity split) | Ginger Beer |

See `canonicalization-risks.json` for full risk register.

---

## Recommended Future Architecture

### Phase 0 — Immediate guard (Option E)

- Persist `purchase_quantity` + `base_unit` snapshot on `ingredient_price_history`
- **Block** `previous_price` chain when pack contract differs
- Classify opportunity as `format_change` not `price_spike`

### Phase 1 — Pack variants (Option A + D)

```
ingredients (concept: "Mozzarella fior di latte")
  └── ingredient_pack_variants
        ├── Bocconcino 125g×8 tray  (pq=10, €0.95/op)  ← default for recipes?
        └── Aviludo 2kg block       (pq=1, €13.69)
ingredient_aliases.pack_variant_id → variant
ingredient_price_history.pack_variant_id → variant
```

### Phase 2 — Equivalence groups (Option C)

- Optional group for substitutable packs in recipes
- Supplier comparisons **within** group + same base-unit contract

### Phase 3 — SKU layer (Option B)

- When multi-site / distributor / barcode needs arise

Full evaluation: `future-architecture.json`

---

## What Works Today

- Auto-persist blocks some operational family conflicts (e.g. potato products vs potato bread)
- `duplicate_normalized_name` prevents exact catalog duplicates
- Price delta **arithmetic** is correct on stored operational values
- Sub-recipe XOR model is sound
- `ingredient_aliases.confidence` exists (underutilized for pack disambiguation)

---

## Artifacts

| File | Contents |
|------|----------|
| `identity-findings.json` | Proven weaknesses + impact by feature |
| `canonicalization-risks.json` | Pipeline stages + risk register |
| `future-architecture.json` | Options A–E evaluation + priority order |
| `REPORT.md` | This document |

**Sources:** `.tmp/historical-pricing-integrity-audit/`, `.tmp/ginger-beer-audit/`, `.tmp/vl-final-state-audit/`, `.tmp/validation-lab-closure-audit/`, `src/lib/ingredient-*.ts`, `supabase/migrations/`
