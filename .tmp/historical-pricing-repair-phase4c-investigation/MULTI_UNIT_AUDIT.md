# Multi-Unit Audit — All 5 VL Lines (Phase 3 scope)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · live `validate-repair-scope.mts` run 2026-06-14T23:26Z  
**Mode:** Read-only investigation

---

## All confirmed multi-`un` lines (qty > 1)

| Ingredient | Invoice | Item | Line | Qty | Unit | Unit € | Pipeline op | True per-item € | History ID | Stored | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Anchoas | `c2f52357` | `a30ae064` | Anchovas 495g | 2 | un | 9.49 | 4.745 | **9.49** | `952119dc` | 4.745 | **INCORRECT** |
| Gema líquida | `c2f52357` | `d26f0c74` | Ovo Gema 1kg | 6 | un | 10.19 | 1.698 | **10.19** | `e967f673` | 1.698 | **INCORRECT** |
| **Atum em óleo** | `c2f52357` | `ff2ad683` | Atum 1 Kg | **2** | un | **6.29** | **3.145** | **6.29** | `61c51696` | **3.145** | **INCORRECT** |
| Anchoas | `3b4cb21f` | `38129b5d` | Anchoas 495g | 2 | un | 9.99 | 4.995 | **9.99** | `908de185` | 4.995 | **INCORRECT** |
| Gema líquida | `3b4cb21f` | `30ccb08d` | Ovo Gema 1 Kg | 6 | un | 10.49 | 1.748 | **10.49** | `e143080d` | 1.748 | **INCORRECT** |

---

## Validation flags

All five lines:

- `suspect_double_divide: true`
- `op_matches_invoice: true` (pipeline-consistent but economically wrong)

---

## Not affected (control cases)

| Ingredient | Reason |
|---|---|
| Pepino | `cx` + pack semantics → `resolveUnitsPerPack`, not `rowQty` |
| Arroz | Same — carton/pack path, not countable `un` double-divide |

---

## Ingredient IDs

| Ingredient | ID |
|---|---|
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` |

---

## Verdict

**5/5 multi-`un` confirmed lines INCORRECT** — all halved (or divided by qty) relative to true per-item unit price. Pattern is generic, not Atum-specific.
