# Ingredient Audit — Historical Pricing Validation Phase 1

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Sample:** 6 ingredients with confirmed invoice matches + linked `ingredient_price_history`

| Ingredient | ID | Classification |
|---|---|---|
| Pepino conserva | `635a1189-36ea-4ff2-9012-8172ab1ab81d` | **VALID** |
| Arroz agulha | `07a55cf5-b98d-4aae-b330-b4944882e4d3` | **VALID** |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | **SUSPICIOUS** |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` | **SUSPICIOUS** |
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | **INCORRECT** |
| Mozzarella fior di latte | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | **INCORRECT** |

---

## 1. Anchoas — `c811f67f-df4d-4194-ba8b-7a15d4af38bd` — SUSPICIOUS

**Catalog:** `current_price=9.99`, `purchase_quantity=2`, unit `g` → operational **€4.995**

| Invoice | Date | Supplier | Line | Qty | Unit | Unit € | Total | Usable | Norm op € | History new | Δ% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c2f52357 | 2026-04-17 | AVILUDO | Filete Anchovas…495g | 2 | un | 9.49 | 18.98 | 990g | **4.745** | 4.745 | — |
| 3b4cb21f | 2026-05-19 | Aviludo | Filete Anchoas…495g | 2 | un | 9.99 | 19.98 | 990g | **4.995** | 4.995 | **+5.27%** ✓ |

- Per-invoice history **matches pipeline math** (`9.49/2`, `9.99/2`)
- **Issue:** `unit_price` is per tin (total = qty × price); dividing by qty again yields half the true per-tin cost
- **Issue:** `ingredient_unit=g` but values are €/un operational
- **Issue:** May row `created_at=2023-05-19` vs `invoice_date=2026-05-19` → breaks `created_at` ordering

---

## 2. Pepino conserva — `635a1189-36ea-4ff2-9012-8172ab1ab81d` — VALID ✅

**Catalog:** `22.49 / 6 = €3.748/un` — matches latest history

| Invoice | Date | Line | Unit € | purchase_qty | Op € | History | Δ% |
|---|---|---|---|---|---|---|---|
| c2f52357 | 2026-04-17 | Pepinos Extra II Frasco 6X720g | 21.99 | 6 | 3.665 | 3.665 | — |
| 3b4cb21f | 2026-05-19 | Pepinos Extra Uli Frasco 6x720g | 22.49 | 6 | 3.748 | 3.748 | **+2.27%** ✓ |

- Bidfood poison row `a689bd91` **absent** (cleaned per pepino-live-validation)
- Chronology + `current_price` alignment: **correct**

---

## 3. Arroz agulha — `07a55cf5-b98d-4aae-b330-b4944882e4d3` — VALID ✅

**Catalog:** `13.95 / 12 = €1.1625/un`

| Invoice | Date | Line | Unit € | pq | Op € | Δ% |
|---|---|---|---|---|---|---|
| c2f52357 | 2026-04-17 | Arroz Agulha Metro Chef 12x1kg | 13.45 | 12 | 1.121 | — |
| 3b4cb21f | 2026-05-19 | Arroz Agulha Metro Chef 12x1 kg | 13.95 | 12 | 1.162 | **+3.72%** ✓ |

- `cx` path correctly uses 12 from name, not row qty
- May row `created_at=2023-05-19` corrupts UI “latest activity” pick (catalog still correct)

---

## 4. Atum em óleo — `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` — INCORRECT ❌

**Catalog:** `13.10 / 1 = €13.10` (base inferred `un`, catalog unit `g`)

| Invoice | Date | Line | Qty | Unit € | pq | Stored op | True €/kg |
|---|---|---|---|---|---|---|---|
| c2f52357 | 2026-04-17 | Atum…1 Kg | **2** un | 6.29 | 2 | **3.145** | **6.29/kg** |
| 3b4cb21f | 2026-05-19 | Atum…1 Kg | 1 un | 13.10 | 1 | **13.10** | **13.10/kg** |

- History row: `prev=3.145 → new=13.10`, **Δ=+316.5%** — arithmetic correct on stored values, **economically wrong**
- Real kg increase: **6.29 → 13.10 = +108%**, not +316%
- UI `priceActivity` (ordered by `created_at DESC`) picks **April row with null delta** — **316% spike invisible in catalog signals**
- April line: double-divide (`6.29/2`) when unit_price is already per 1kg bag

---

## 5. Mozzarella fior di latte — `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` — INCORRECT ❌

**Catalog:** `13.69/un` (2kg block) — **does not match** chronologically latest history

| Invoice | Match status | Line | Op € | History rows |
|---|---|---|---|---|
| c2f52357 | **confirmed** | Mozzarella Flor di Latte **2Kg** | 13.69 | **2 duplicate rows** (`9ee1b793`, `3c508a43`) |
| f0aa5a08 | **suggested** (semantic) | MOZZARELLA…**125GR*8** qty 10 @ 8.12 | 0.812 | `18bdb0c5` — **history exists without confirm** |

- 125g×8 balls (€0.812/piece) vs 2kg block (€13.69) are **different pack contracts** on one canonical ingredient
- Backfill included **suggested** match → poison history from unconfirmed line
- `fetchLatestHistoryNewPrice` by `created_at` → **0.812** wins over 13.69 chronologically

---

## 6. Gema líquida — `32dbf47d-347c-45f3-bd9f-c6e90640e767` — SUSPICIOUS ⚠️

**Catalog:** `10.49 / 6 = €1.748` (unit `g`, values are €/un operational)

| Invoice | Date | Qty | Unit € | pq | Op € | Δ% |
|---|---|---|---|---|---|---|
| c2f52357 | 2026-04-17 | **6** un | 10.19 | 6 | 1.698 | — |
| 3b4cb21f | 2026-05-19 | **6** un | 10.49 | 6 | 1.748 | **+2.94%** ✓ |

- Same multi-`un` divide pattern: **€10.19/tub stored as €1.698** (should be €10.19/tub if unit_price is per tub)
- `ingredient_unit=g` mislabels €/un values
- May `created_at=2023-05-19` corruption
