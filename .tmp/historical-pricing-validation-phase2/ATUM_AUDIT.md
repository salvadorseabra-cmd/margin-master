# Atum Audit — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

**Ingredient:** Atum em óleo · `0f30ccb3-bb47-40bb-83cc-ae2a4018066d`  
**Catalog:** `current_price=13.10`, `purchase_quantity=1`, unit `g` → operational **€13.10**

---

## Row-by-row trace

| # | History ID | Invoice | Date | Supplier | Line | Qty | Unit | Unit € | Norm pq | Stored op | Prev | Δ% | `created_at` | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `61c51696` | `c2f52357` | 2026-04-17 | AVILUDO | Atum Óleo Bolsa Nau Catrineta **1 Kg** | 2 | un | 6.29 | **2** | **3.145** | null | — | `2026-04-17T12:00` | **INCORRECT** |
| 2 | `781ab1ac` | `3b4cb21f` | 2026-05-19 | Aviludo | Atum Oleo Bolsa Nau Catrineta **1 Kg** | 1 | un | 13.10 | 1 | **13.10** | 3.145 | **+316.5%** | `2023-05-19T12:00` ⚠️ | **INCORRECT** (delta semantics) |

---

## Row 1 — April (`61c51696`) — INCORRECT

| Field | Value |
|---|---|
| Invoice item | `ff2ad683` · confirmed-override |
| Raw math | 2 × €6.29 = €12.58 ✓ (`implied_unit_price` = 6.29) |
| Usable stock | 2000 g (2 × 1 kg bags) — stock path correct |
| Pipeline | `purchase_qty=2` → `6.29/2 = 3.145` |
| True €/kg | **€6.29/kg** (unit_price is per 1 kg bag) |
| `op_matches_invoice` | true (pipeline-consistent) |
| Why wrong | `unit_price` already per bag; `resolveCountablePurchaseQuantityForCost` divides by row qty again. Name **1 Kg** not routed to weight/`g` base. |

**Verdict:** **Requires fix** (multi-`un` denominator + weight-in-name routing)

---

## Row 2 — May (`781ab1ac`) — INCORRECT (chain comparison)

| Field | Value |
|---|---|
| Invoice item | `79956d1b` · confirmed-override |
| Raw math | 1 × €13.10 = €13.10 ✓ |
| Pipeline | `purchase_qty=1` → `13.10/1 = 13.10` |
| True €/kg | **€13.10/kg** |
| Previous | 3.145 from Row 1 |
| Δ% | `(13.10−3.145)/3.145 × 100 = **316.5%**` — arithmetic exact |
| True kg move | `(13.10−6.29)/6.29 × 100 = **+108%**` |
| `created_at` | **2023-05-19** vs invoice **2026-05-19** — timestamp corruption |
| Why wrong | Cross-base chain: half-bag operational vs full-bag operational |

**Verdict:** **Requires fix** (delta semantics) + **Historical artifact** / **Active contamination** (`created_at`)

---

## Source of +316% spike

1. April row stores **3.145** (€6.29 wrongly halved).
2. May persist uses `resolvePreviousOperationalPriceForHistory` → prior = **3.145**.
3. `computePriceHistoryDelta(3.145, 13.10)` → +316.5%.
4. Chain guard allows it: ratio 4.16× < `RATIO_HARD_CEILING` (14); both classified countable `un`.
5. UI `priceActivity` sorts `created_at DESC` → picks April row (**null Δ**) → **316% invisible in catalog signals**.

---

## Equivalence

| Comparison | Expected | Observed |
|---|---|---|
| Apr → May €/kg | 6.29 → 13.10 (+108%) | 3.145 → 13.10 (+316%) ❌ |
| History label | €/kg or €/g | `ingredient_unit=g`, values are €/un ❌ |

---

## `current_price` correctness

| Source | Value | Correct? |
|---|---|---|
| `ingredients.current_price` | 13.10 (op €13.10) | ✅ Latest **confirmed** purchase |
| Latest history by **invoice chronology** | €13.10 (`781ab1ac`) | ✅ |
| Latest history by **`created_at DESC`** | €3.145 (`61c51696` Apr) | ❌ 4× understate |

- **Catalog €13.10** = correct from May confirmed purchase (`13.10/1`).
- **Latest history by invoice chronology** = €13.10 ✓
- **Latest history by `created_at DESC`** = €3.145 (April) ❌ — revert would 4× understate.

---

## Summary

| Row | Class | Tags |
|---|---|---|
| `61c51696` (Apr) | **INCORRECT** | **Requires fix** |
| `781ab1ac` (May) | **INCORRECT** | **Requires fix** + **Historical artifact** |
| Catalog `current_price` | **VALID** | **Safe to ignore** (correct today) |
