# Blast Radius — Multi-`un` Double-Divide Bug

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · live DB scan 2026-06-14T23:26Z  
**Mode:** Read-only investigation

---

## Scope counts

| Scope | Count |
|---|---|
| Confirmed multi-`un` lines (qty > 1) | **5** |
| Unique ingredients | **3** |
| History rows matching wrong pipeline | **6** |
| Other VL ingredients with same pattern | **0** |

---

## Affected ingredients

| Ingredient | ID | History rows |
|---|---|---|
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | 2 |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | 2 |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` | 2 |

---

## Exact history row IDs

```
61c51696-acd8-4a58-878f-a588c1878af0  Atum Apr
781ab1ac-39d2-4462-9106-635e5603c466  Atum May (rechain)
952119dc-8645-4a5f-a3ff-191ae1a57ea8  Anchoas Apr
908de185-e61a-4f41-af4c-3b70f69bd08f  Anchoas May
e967f673-1dc5-4390-90e6-464b66ec2a4b  Gema Apr
e143080d-511b-4c37-9018-11949343aedc  Gema May
```

---

## `current_price` contamination

| Ingredient | Catalog | `purchase_qty` | Catalog op | True latest op | Contaminated? |
|---|---|---|---|---|---|
| **Atum** | 13.10 | 1 | 13.10 | 13.10 | **No** — May qty=1 |
| **Anchoas** | 9.99 | 2 | 4.995 | **9.99** | **Yes** — halved |
| **Gema líquida** | 10.49 | 6 | 1.748 | **10.49** | **Yes** — divided by 6 |

---

## Opportunity / intelligence contamination

| Surface | Atum | Anchoas / Gema |
|---|---|---|
| History trend / Δ% | **316% false spike** (should ~108% for Atum) | Δ% magnitudes understated (~half) |
| Inflation alerts | Misleading spike if in window | Understated unit costs in savings math |
| `revertIngredientCurrentPriceFromHistory` | **Safe post-4B** (reverts to 13.10) | Would revert to halved ops |
| Recipe costing (catalog) | **Correct** for Atum | **Wrong** — uses halved operational |

---

## Classification

**Generic bug** in countable `un` handling — Atum is the most visible case (316% spike), not an Atum-only defect.

| Question | Answer |
|---|---|
| Atum only? | **No** — 3 ingredients, 5 invoice lines, 6 history rows on VL |
| Active contamination? | **Yes** — Anchoas/Gema catalog + all 6 history rows |
| Safe to ignore? | **No** — except Atum `current_price` (already correct) |
