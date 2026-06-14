# Mozzarella Audit — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

**Ingredient:** Mozzarella fior di latte · `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`  
**Catalog:** `current_price=13.69`, `purchase_quantity=1`, unit `un` → operational **€13.69**

---

## Row-by-row trace

| # | History ID | Invoice | Date | Supplier | Source | Match status | Line | Op € | Prev | Δ% | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `3c508a43` | `c2f52357` | 2026-04-17 | AVILUDO | Backfill / first insert | **confirmed** | Mozzarella Flor di Latte **2Kg** | 13.69 | null | — | **VALID** (bootstrap) |
| 2 | `9ee1b793` | `c2f52357` | 2026-04-17 | AVILUDO | Duplicate insert | **confirmed** | same | 13.69 | 13.69 | 0% | **INCORRECT** (duplicate) |
| 3 | `18bdb0c5` | `f0aa5a08` | 2026-05-08 | IL BOCCONCINO | **Backfill** (suggested) | **suggested** / semantic | MOZZARELLA…**125GR*8** qty 10 @ 8.12 | **0.812** | null | — | **INCORRECT** (poison) |

---

## Duplicate origin (`3c508a43` + `9ee1b793`)

- Same `(invoice_id=c2f52357, ingredient_id)` — **no unique constraint** in migration.
- `3c508a43`: bootstrap (`prev=null`).
- `9ee1b793`: second insert (`prev=13.69`, `delta=0`) — likely second backfill or confirm pass before dedup saw first row.
- **Should exist:** exactly **one** row for Aviludo April. Keep `3c508a43`; delete `9ee1b793`.

**Verdict:** **Requires fix**

---

## Bocconcino poison row (`18bdb0c5`)

| Field | Value |
|---|---|
| Invoice item | `ec1932a2` |
| Persisted match | `status=suggested`, `match_kind=semantic` (created 2026-06-14) |
| Line | 125g×8 balls, qty **10**, unit_price **€8.12** |
| Pipeline | `purchase_qty=10` → `8.12/10 = **0.812**` |
| Pack contract | 125g×8 balls ≠ 2kg block on same canonical ID |
| Creation path | `backfillIngredientPriceHistoryFromInvoices` — virtual matcher returns `suggested`, not gated like live extract |
| Live extract gate | Would **skip** `semantic` when `VITE_MATCH_LIFECYCLE_EXTRACT_GATE` ON |

**Economically:** €8.12/pack-of-8 → €1.015/ball or ~€8.12/kg-equivalent — not comparable to €13.69/2kg block.

**Verdict:** **Active contamination** · **Requires fix**

---

## Match lifecycle

- Aviludo 2Kg: **confirmed** (`confirmed-override`, 2026-06-14).
- Bocconcino: **suggested only** — never confirmed; history should not exist.
- Phase 5B subtractive reassign: **not** the cause (no reassign on these lines).

**Verdict (Phase 5B):** **Safe to ignore**

---

## Which rows should exist

| Should exist | Should not |
|---|---|
| One Aviludo April row @ €13.69 (`3c508a43`) | Duplicate `9ee1b793` |
| — | Bocconcino `18bdb0c5` until confirmed + pack guard |

---

## `current_price` contamination

| Source | Value | Correct? |
|---|---|---|
| `ingredients.current_price` | 13.69 (op €13.69) | ✅ Latest **confirmed** 2kg block |
| Latest confirmed purchase | Apr Aviludo 2Kg · €13.69 | ✅ |
| Latest history by **`created_at DESC`** | €0.812 (`18bdb0c5`) | ❌ poison row wins sort |

- **Catalog €13.69** — correct (from confirmed Aviludo persist).
- **Not contaminated** by Bocconcino in catalog row.
- **Contaminated in history queries:** `fetchLatestHistoryNewPrice` → **0.812** (Bocconcino `created_at` 2026-05-08 > April 2026-04-17).

---

## Summary

| Row | Class | Tags |
|---|---|---|
| `3c508a43` | **VALID** | **Safe to ignore** |
| `9ee1b793` | **INCORRECT** | **Requires fix** |
| `18bdb0c5` | **INCORRECT** | **Active contamination** · **Requires fix** |
| Catalog `current_price` | **VALID** | **Safe to ignore** (correct today) |

**Overall:** 1 VALID, 2 INCORRECT.
