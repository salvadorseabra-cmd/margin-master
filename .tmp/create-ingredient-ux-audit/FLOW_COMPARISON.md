# Flow Comparison — Create Ingredient Entry Points

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Classification: **A — Same flow, two entry points**

| Dimension | External button | Picker "Create ingredient" | Same? |
|-----------|-----------------|--------------------------|-------|
| Handler | `onCreateIngredient(renderItem)` | `onCreateIngredient(renderItem)` | **Yes** |
| Parent binding | `openCanonicalIngredientCreate` | `openCanonicalIngredientCreate` | **Yes** |
| Dialog | `CanonicalIngredientCreateDialog` | Same | **Yes** |
| Save | `saveCanonicalIngredientFromInvoice` | Same | **Yes** |
| Core service | `saveCanonicalIngredientFromInvoiceRow` | Same | **Yes** |
| Alias persist | `persistIngredientCorrectionForItem` | Same | **Yes** |
| MLS | `confirmMatch` via dual-write | Same | **Yes** |
| Disabled logic | `creatingIngredient \|\| !canCreateIngredient` | Same | **Yes** |

---

## Visibility Matrix

| Row state | Picker "Create ingredient" | External "Create new ingredient" |
|-----------|---------------------------|----------------------------------|
| **Confirmed** | Yes (open chip → Actions) | No |
| **Suggested** | Yes | No |
| **Unmatched** | Yes | **Yes — duplicate** |
| **Rejected** | Yes | **Yes — duplicate** |

Prior audit: `.tmp/match-ui-consolidation-audit/DEAD_CODE_AUDIT.md` — standalone button "duplicates picker action".

---

## Not B (Different Flows)

No alternate service, no different MLS branch, no different `flowOrigin`. Both are `explicit_user` canonical create.

---

## Not C (One Obsolete)

Neither path is dead. External retained post–Correct match removal. Picker create is the only create entry for confirmed/suggested rows.
