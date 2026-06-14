# Before State — Historical Pricing Repair Phase 4B (created_at)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Pre-repair scope validation (no data changes yet)

**Invoice:** `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` · `invoice_date=2026-05-19`

---

## Scope reconciliation vs Phase 3

| Check | Expected (Phase 3) | Live (2026-06-15) | Match |
|---|---|---|---|
| Corrupted rows on invoice | 7 | 7 | ✅ |
| Total rows on invoice | 8 (7 corrupt + Pepino) | 8 | ✅ |
| Global year-mismatch rows | 7 | 7 | ✅ |
| `all_expected_present` | true | true | ✅ |
| Pepino `5bd9a4e1` untouched | `2026-05-19` | `2026-05-19T12:00:00+00:00` | ✅ |

**Verdict:** Scope unchanged from Phase 3 — safe to proceed with created_at repair only.

---

## Rows to repair (7)

| History ID | Ingredient | Ingredient ID | `created_at` (wrong) | `new_price` |
|---|---|---|---|---|
| `edc6c627` | Arroz agulha | `07a55cf5` | `2023-05-19` | 1.1625 |
| `14330aad` | Nata culinária | `3d1af48c` | `2023-05-19` | — |
| `908de185` | Anchoas | `c811f67f` | `2023-05-19` | 4.995 |
| `1d9d5133` | Açúcar branco | `c46db69a` | `2023-05-19` | — |
| `781ab1ac` | Atum em óleo | `0f30ccb3` | `2023-05-19` | 13.10 |
| `e143080d` | Gema líquida | `32dbf47d` | `2023-05-19` | 1.7483 |
| `bf250ee4` | Chocolate culinária | `43cba6b0` | `2023-05-19` | — |

**Correct (no repair):** `5bd9a4e1` (Pepino conserva) · `created_at=2026-05-19`

**Target:** `created_at = 2026-05-19T12:00:00.000Z` for all 7 rows above.

---

## Contamination signals (sample ingredients)

| Ingredient | Catalog op € | Latest history op € | Matches? | Root cause |
|---|---|---|---|---|
| Atum em óleo | 13.10 | **3.145** (April) | ❌ | May row sorts before April (`2023 < 2026`) |
| Arroz agulha | 1.1625 | **1.1208** (April) | ❌ | Same ordering bug |
| Anchoas | 4.995 | **4.745** (April) | ❌ | Same ordering bug |
| Gema líquida | 1.7483 | **1.6983** (April) | ❌ | Same ordering bug |
| Pepino conserva | 3.7483 | 3.7483 | ✅ | Correct `created_at` |
| Mozzarella | 13.69 | 13.69 | ✅ | Phase 4A already complete |

---

## NOT IN SCOPE

- Atum denominator / delta chain (Phase 4C)
- Mozzarella rows (Phase 4A — done)
- `current_price`, `new_price`, `previous_price`, deltas
- Match lifecycle, OCR, schema changes

---

## Validation commands run

```bash
npx vite-node scripts/validate-repair-scope.mts
npx vite-node scripts/validate-historical-pricing.mts 2>/dev/null
```
