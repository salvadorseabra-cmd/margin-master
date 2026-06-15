# Row Audit — `14330aad-cce1-4569-aa2f-4976dd1ac336`

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** Read-only

---

## Row identity

| Field | Value |
|---|---|
| **History ID** | `14330aad-cce1-4569-aa2f-4976dd1ac336` |
| **Ingredient** | Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b` |
| **Invoice** | `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` (Aviludo May) |
| **Invoice date** | 2026-05-19 |
| **Source item** | `1826cbe9` — Nata Culinaria 22% Reny Picot 6x1 Lt |
| **Supplier (history stamp)** | Aviludo |
| **Pack price** | 18.89 |
| **Operational price (`new_price`)** | **3.148** |
| **Previous price** | 3.048 |
| **Delta** | +0.10 (+3.28%) |

---

## Creation & timestamps

| Event | Timestamp / detail |
|---|---|
| **Original `created_at`** | `2023-05-19` (timestamp corruption — wrong year) |
| **Phase 4B repair** | Repaired to `2026-05-19T12:00:00+00:00` |
| **Row retained after 4B** | Yes — 4B fixed ordering only, did not delete |
| **Persisted match row** | `invoice_item_matches` for item `1826cbe9` created **2026-06-14** (MLS dual-write) — **after** history row already existed |

---

## Match at write time

| Field | Value |
|---|---|
| **Match status** | `suggested` |
| **Match kind** | `semantic` |
| **Confirmed alias?** | No — "Reny" vs alias "Remy"; supplier "Aviludo" vs alias "Avijudo" |
| **User confirmation?** | Never confirmed |

---

## Classification

| Path | Applies? | Evidence |
|---|---|---|
| **Confirmed persist** | ❌ | `persistOperationalIngredientCostFromInvoiceLine` updates catalog **and** history together. Catalog stayed at April 18.29. |
| **Backfill** | ✅ **Primary write path** | `backfillIngredientPriceHistoryFromInvoices` wrote history without catalog update |
| **Repair (4B)** | ✅ Partial | `created_at` year corrected; row not deleted |
| **MLS dual-write** | Indirect | Created persisted `invoice_item_matches` record on 2026-06-14; did not create the history row |

**Final classification:** **`backfill`** (primary) + **`repair`** (4B created_at only). Same contamination class as pre-4A Mozzarella poison row.

---

## Why backfill accepted this row

Backfill skips only `unmatched` rows. Suggested matches pass the gate:

```168:171:src/lib/ingredient-price-history-backfill.ts
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      result.skippedUnmatched += 1;
      continue;
    }
```

`"suggested"` ≠ `"unmatched"` → history row written.

---

## Why this is orphan contamination

1. History row exists with operational price 3.148
2. No confirmed match backs it (`invoice_item_matches.status = 'suggested'`)
3. Catalog was never updated (still 18.29 / op 3.048 from April confirmed purchase)
4. Latest-history queries surface 3.148 while catalog holds 3.048

---

## Safe repair options

| Option | Action | Outcome |
|---|---|---|
| **A (recommended)** | DELETE row `14330aad` | Mirrors 4A Mozzarella pattern; catalog and latest history both 3.048 |
| **B (user decision)** | Confirm May match `1826cbe9` + refresh catalog to 18.89 | Catalog and history both 3.148 — legitimate if user accepts May price |
