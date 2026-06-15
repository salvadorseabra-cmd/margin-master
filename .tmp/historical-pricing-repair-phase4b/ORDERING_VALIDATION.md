# Ordering Validation — Historical Pricing Repair Phase 4B

**Queried:** 2026-06-15 · post-repair

---

## Invoice `3b4cb21f` chronology

All 8 rows now share `created_at` year **2026**, matching `invoice_date=2026-05-19`.  
No `2023-*` timestamps remain on VL.

---

## Per-ingredient ordering (created_at ASC)

### Atum em óleo — critical case

| Order | History ID | Invoice date | `created_at` | `new_price` | Role |
|---|---|---|---|---|---|
| 1 | `61c51696` | 2026-04-17 | `2026-04-17T12:00:00+00:00` | 3.145 | April (older) |
| 2 | `781ab1ac` | 2026-05-19 | `2026-05-19T12:00:00+00:00` | 13.10 | **May (latest)** ✅ |

**Before:** May sorted *before* April (`2023-05-19 < 2026-04-17`) → `fetchLatestHistoryNewPrice` returned April **3.145**.  
**After:** May sorts *after* April → returns May **13.10** ✅

### Sample ingredients (validate-historical-pricing)

| Ingredient | History order (ASC) | Latest by `created_at DESC` | Matches catalog? |
|---|---|---|---|
| Arroz agulha | Apr `bc6b61db` → May `edc6c627` | 1.1625 (May) | ✅ |
| Anchoas | Apr `952119dc` → May `908de185` | 4.995 (May) | ✅ |
| Gema líquida | Apr `e967f673` → May `e143080d` | 1.7483 (May) | ✅ |
| Pepino | Apr `d723199d` → May `5bd9a4e1` | 3.7483 (May) | ✅ (unchanged) |
| Mozzarella | Apr `3c508a43` only | 13.69 | ✅ (Phase 4A) |

### Repaired non-sample ingredients

| Ingredient | Latest history op € (post) | Catalog op € | Ordering correct? |
|---|---|---|---|
| Nata culinária | 3.1483 (May) | 3.0483* | ✅ May wins sort |
| Açúcar branco | 0.999 (May) | 0.999 | ✅ |
| Chocolate culinária | 2.999 (May) | 2.999 | ✅ |

\* Nata catalog reflects April persist; latest history now correctly surfaces May row. Catalog unchanged by design.

---

## `fetchLatestHistoryNewPrice` summary

| Ingredient ID | Before | After |
|---|---|---|
| `0f30ccb3` (Atum) | 3.145 | **13.10** |
| `07a55cf5` (Arroz) | 1.1208 | **1.1625** |
| `c811f67f` (Anchoas) | 4.745 | **4.995** |
| `32dbf47d` (Gema) | 1.6983 | **1.7483** |
| `3d1af48c` (Nata) | 3.0483 | **3.1483** |
| `c46db69a` (Açúcar) | 0.929 | **0.999** |
| `43cba6b0` (Chocolate) | 2.919 | **2.999** |

**Verdict:** Chronological ordering restored for all 7 repaired ingredients.
