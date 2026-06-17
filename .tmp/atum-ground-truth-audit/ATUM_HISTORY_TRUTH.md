# Atum History Truth

**Ingredient:** `0f30ccb3-bb47-40bb-83cc-ae2a4018066d`  
**Source:** VL snapshot 2026-06-14

---

## Stored `ingredient_price_history` rows

| id | invoice | date | prior_price | new_price | delta | delta_percent | created_at |
|----|---------|------|-------------|-----------|-------|---------------|------------|
| `61c51696` | April `c2f52357` | 2026-04-17 | null | **3.145** | null | null | 2026-04-17T12:00 |
| `781ab1ac` | May `3b4cb21f` | 2026-05-19 | **3.145** | **13.10** | 9.955 | **+316.5%** | 2023-05-19T12:00 ⚠️ |

---

## Correct history (from invoice per-bag prices)

| Row | prior | new | delta% |
|-----|-------|-----|--------|
| April | null | **6.29** | — |
| May | **6.29** | **6.55** | **+4.1%** |

---

## Verdict

Both stored rows are wrong:

- **April:** halved (6.29 ÷ 2 = 3.145) — divide-by-qty bug
- **May:** stores line total (13.10) instead of per-bag (6.55) — wrong `invoice_items` row used
- **+316%:** chains off corrupted April prior; true move is **+4.1%**
