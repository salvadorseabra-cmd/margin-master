# Identity Contamination Audit

**Mode:** READ-ONLY · **Generated:** 2026-06-13

---

## Executive Answer

**Is Mozzarella/Pepino isolated or systemic?**

**PROVEN_CASES_ONLY_IN_VL_SAMPLE — STRUCTURAL_ARCHITECTURE_RISK** — 2/9 VL multi-purchase ingredients contaminated today (Mozzarella, Pepino). Problem is STRUCTURAL — 100% of P0-guard-broken chains are identity collapse, not isolated data errors.

| Metric | Value |
|--------|-------|
| Catalog ingredients | 9 |
| With matched purchases | 9 |
| With 2+ purchases | 9 |
| With price_history | 9 |
| **Contaminated** | **2** |
| HIGH / MEDIUM / LOW | 2 / 0 / 0 |
| Safe for pricing history | 7 |
| Unsafe for pricing history | 2 |

---

## Facts

- VL catalog: **9** ingredients; **9** have matched purchases; **9** have 2+ purchases.
- **2** ingredients fail P0 `purchaseContractsChainCompatible` across purchase pairs (**2 HIGH** confidence).
- **7** ingredients have 2+ purchases with all pairs guard-compatible.
- **46/51** invoice lines unmatched — contamination latent for unmapped lines.
- P0 guard blocks OI alerts; ingredient detail purchase fallback **unguarded**.
- **14/20** price_history rows ghost/stale.

## Observations

- **100% of P0-guard-broken chains** are Mozzarella + Pepino only.
- **7/9** multi-purchase ingredients chain cleanly (same pack contract).
- Atum on movement watchlist — guard compatible, likely real price change.
- Mammafiore 3kg mozzarella **unmatched** — latent third format.
- Pepino fresh matched to **"Pepino conserva"** catalog name.

## Calculations

- Multi-purchase contamination rate: **2/9 = 22%**
- Foundation risk confidence: **88%**

## Hypotheses

- Contamination is **architectural** — will recur as matching improves.
- VL sample **understates spread** (90% lines unmatched).
- P1 pack variants required before foundation CLOSED.

---

## Critical Question

**Is Ingredient Identity contamination the largest remaining foundation risk?**

**YES** (88% confidence)

- Only 2 HIGH-confidence contaminated ingredients in VL (Mozzarella, Pepino) — 100% of P0-guard-broken multi-format chains
- P0 guard suppresses OI false positives but does not fix catalog collapse or ingredient-panel purchase fallback
- 46/51 invoice lines unmatched — contamination latent until persist improves
- Extraction pipeline mostly closed; identity is dominant blocker per post-p0-foundation-audit

---

## Proven Cases (reconfirmed)

### 1. Mozzarella fior di latte (`2a99cecd`)
- **Purchases:** Aviludo 2Kg block (€13.69/un) + Bocconcino 125GR×8 tray (€8.12/un, op €0.812)
- **Signals:** A (pack_weight_magnitude), F (extreme ratio)
- **Impact:** False −41% purchase display; poisoned +1341% history chain
- **P0:** OI alerts suppressed; ingredient panel still shows purchase fallback

### 2. Pepino conserva (`635a1189`)
- **Purchases:** Aviludo/May preserved jars + Bidfood fresh Pepino (€1.77/kg)
- **Signals:** C (fresh vs conserva), F (−99.95% history delta)
- **Impact:** False −99% deflation; catalog named "conserva" matched to fresh produce
- **P0:** History chain broken; raw delta remains

---

## Contamination Signal Legend

| Signal | Meaning |
|--------|---------|
| A | Weight contract mismatch (125g / 1kg / 2kg / 5kg) |
| B | Countable vs weight unit family |
| C | Fresh vs preserved |
| D | Packaging / volume contract mismatch |
| E | Supplier-product naming mismatch |
| F | Extreme movement >50% or P0 ratio ceiling |

Detection reuses `purchaseContractsChainCompatible` from `ingredient-price-chain-guard.ts` plus name/preservation heuristics.

---

## Contaminated Ingredients (2)

### Pepino conserva — **HIGH**
- Signals: B, E, F
- Purchases: 3 · History rows: 3
- Why: countable vs weight unit family; supplier-product / naming mismatch; extreme price movement (>50% or ratio ceiling)
- Impact: UNSAFE — best-buy / % change on invoice unit_price not €/kg equivalent

### Mozzarella fior di latte — **HIGH**
- Signals: A, F
- Purchases: 2 · History rows: 3
- Why: weight contract mismatch (pack magnitude); extreme price movement (>50% or ratio ceiling)
- Impact: UNSAFE — best-buy / % change on invoice unit_price not €/kg equivalent

---

## Safe for Pricing History (7)

- **Arroz agulha** — 2 purchases — all P0 guard pairs compatible
- **Nata culinária** — 2 purchases — all P0 guard pairs compatible
- **Anchoas** — 2 purchases — all P0 guard pairs compatible
- **Açúcar branco** — 2 purchases — all P0 guard pairs compatible
- **Atum em óleo** — 2 purchases — all P0 guard pairs compatible
- **Gema líquida** — 2 purchases — all P0 guard pairs compatible
- **Chocolate culinária** — 2 purchases — all P0 guard pairs compatible

---

## P0 Guard vs Remaining Exposure

| Surface | Status |
|---------|--------|
| OI margin alerts | Guarded — mozzarella/pepino false positives suppressed |
| Supplier intelligence synthesis | Guarded on chain-compatible checks |
| Ingredient detail panel | **Unguarded** — purchase unit_price fallback (−41%) |
| Raw `ingredient_price_history` | **Poisoned rows remain** (14 ghost + cross-format deltas) |
| `ingredients.current_price` | **Last-write-wins** across formats |

---

## Observations

- **100% contamination rate** among VL ingredients with 2+ matched purchases (2/2).
- **46/51** invoice lines unmatched — contamination is **latent** across catalog as matching improves.
- Stale DB (4/6 invoices Jun 11 era) masks some pairs; re-read may surface additional cases (e.g. Mammafiore 3kg mozzarella).

## Hypotheses

- Contamination is **architectural** (single `ingredient_id` per concept) not a one-off data entry error.
- P0 is a **read-path bandage**; P1 pack variants required to close foundation.

---

## Artifacts

| File | Contents |
|------|----------|
| `contaminated-ingredients.json` | Full per-ingredient evidence |
| `contamination-matrix.json` | Pairwise purchase guard matrix |
| `risk-ranking.json` | Ranked risk scores |
| `executive-summary.json` | Counts + foundation risk answer |
| `run-audit.mts` | Reproducible harness |
