# After State — Historical Pricing Repair Phase 4B

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Post-repair validation

---

## Invoice `3b4cb21f` — all 8 rows

| History ID | Ingredient | `created_at` | Status |
|---|---|---|---|
| `edc6c627` | Arroz agulha | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `14330aad` | Nata culinária | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `908de185` | Anchoas | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `1d9d5133` | Açúcar branco | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `781ab1ac` | Atum em óleo | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `e143080d` | Gema líquida | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `bf250ee4-388a-480f-96d7-e8c0e8e8dfb2` | Chocolate culinária | `2026-05-19T12:00:00+00:00` | ✅ repaired |
| `5bd9a4e1` | Pepino conserva | `2026-05-19T12:00:00+00:00` | ✅ unchanged |

---

## Global corruption check

| Metric | Before | After |
|---|---|---|
| Year-mismatch rows (VL) | 7 | **0** |
| Rows still `2023-*` on invoice | 7 | **0** |
| `found_corrupted` (scope script) | 7 | **0** |

---

## Catalog `current_price` (7 repaired ingredients)

| Ingredient | `current_price` before | `current_price` after | Changed? |
|---|---|---|---|
| Arroz agulha | 13.95 | 13.95 | ❌ |
| Nata culinária | 18.29 | 18.29 | ❌ |
| Anchoas | 9.99 | 9.99 | ❌ |
| Açúcar branco | 9.99 | 9.99 | ❌ |
| Atum em óleo | 13.10 | 13.10 | ❌ |
| Gema líquida | 10.49 | 10.49 | ❌ |
| Chocolate culinária | 29.99 | 29.99 | ❌ |

**All catalog prices unchanged** — as expected (repair is ordering-only).

---

## History prices preserved

All 7 rows retain original `new_price`, `previous_price`, `delta`, `delta_percent`.  
Example — Atum May row `781ab1ac`: still `new_price=13.10`, `delta_percent=316.5%` (denominator fix deferred to Phase 4C).
