# Impact Analysis — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

Assumes all three fixes applied: Mozzarella cleanup, created_at repair, Atum denominator (+ Anchoas/Gema multi-`un` scope).

---

## Surface-by-surface impact

| Surface | Atum | Mozzarella | created_at (7 rows) | Anchoas/Gema |
|---|---|---|---|---|
| `ingredients.current_price` | **No change** (13.10) | **No change** (13.69) | **No change** | ⚠️ Still wrong until denominator fix |
| `fetchLatestHistoryNewPrice` | 13.10 ✅ (was 3.145) | 13.69 ✅ (was 0.812) | Ordering fixed globally | Unchanged (still halved) |
| `priceActivity` UI | Shows May +108% spike | Shows Apr bootstrap | Correct latest for all 7 ingredients | Still understated |
| History trend chart | Correct chronology | Single clean point | Correct X-axis | Still wrong values |
| Inflation alerts | May spike ~108% not 316%; window inclusion fixed | No false deflation | Spike window correct | Misleading % |
| `revertIngredientCurrentPriceFromHistory` | Safe (13.10) | Safe (13.69) | Safe for ordering | Would revert to wrong op |
| Opportunities/savings | Trustworthy for Atum | Trustworthy for Mozzarella | Improved for 7 ingredients | Still unreliable |

---

## Revert risk (pre-fix)

| Ingredient | Revert would set | Risk |
|---|---|---|
| Atum | ~€3.15 | **HIGH** |
| Mozzarella | ~€0.81 | **HIGH** |

Catalog `current_price` is correct today for Atum and Mozzarella because live extract uses the latest confirmed line directly. Revert paths and history queries are the contaminated surfaces.

---

## Fix #1 — created_at (7 rows on invoice `3b4cb21f`)

**Ingredients affected:** Arroz agulha, Nata culinária, Anchoas, Açúcar branco, Atum em óleo, Gema líquida, Chocolate culinária.

- **Catalog:** No change (prices already correct).
- **History ordering:** May 2026 rows sort after April 2026 instead of before.
- **Atum:** `fetchLatestHistoryNewPrice` returns May `13.10` instead of April `3.145` (ordering fix only; denominator still wrong until Fix #3).
- **Alerts/trends:** Spike windows and chronology corrected for all 7 ingredients.

---

## Fix #2 — Mozzarella (delete 2 rows)

- **Catalog:** No change (`13.69`).
- **History:** 3 rows → 1 row (`3c508a43`).
- **`fetchLatestHistoryNewPrice`:** `13.69` (was `0.812` from poison row `18bdb0c5` when sorted by `created_at DESC`).
- **Opportunities:** No false deflation signal from €0.812 history point.

---

## Fix #3 — Atum denominator (+ 4 Anchoas/Gema rows)

**Scope:** 5 multi-`un` confirmed lines on VL (see ATUM_ROOT_CAUSE.md).

| Ingredient | History rows to correct | Catalog impact |
|---|---|---|
| Atum em óleo | `61c51696` (Apr), `781ab1ac` (May) | No change (13.10) |
| Anchoas | April + May on `c2f52357` / `3b4cb21f` | ⚠️ May need refresh (catalog uses wrong denominator) |
| Gema líquida | April + May on `c2f52357` / `3b4cb21f` | ⚠️ May need refresh (catalog uses wrong denominator) |

- **Atum delta chain:** +316% → +108% (economically correct).
- **Anchoas/Gema:** Operational prices double (halving bug removed); catalog and opportunities become trustworthy after optional `current_price` refresh.

---

## Unaffected / safe to ignore

| Item | Reason |
|---|---|
| Pepino `5bd9a4e1` created_at | Already correct (`2026-05-19`) |
| Phase 5B reassign | Not the cause of any contamination |
| Catalog `current_price` Atum/Mozzarella | Correct today via latest extract |
