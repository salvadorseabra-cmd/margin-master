# Match Correction Reversal Audit

**Mode:** READ-ONLY · **Generated:** 2026-06-14

---

## Scope

Trace the complete lifecycle when a user **corrects** an invoice-line ingredient match during review.

**Scenario:** Pepino fresco (Bidfood) initially auto-matched to Pepino conserva (`635a1189`) with pre-review poison (`a689bd91`). User then either:
- **A)** Changes match to a different ingredient (picker or create-new if reachable)
- **B)** Selects "No match" (UI unsupported — code gap documented)

Prior context: [pepino-contamination-timeline](../pepino-contamination-timeline/REPORT.md), [remove-match-investigation](../remove-match-investigation/REPORT.md).

---

## Facts

### Correction code path (Scenario A — pick different ingredient)

| Step | Function | File |
|------|----------|------|
| 1 | `openIngredientCorrection` — snapshots `previousIngredientId` | `invoices.tsx` ~2924 |
| 2 | `handleSelectCorrectionIngredient` | `invoices.tsx` ~2944 |
| 3 | `rejectIngredientMatchPair` (if prior ≠ new) | `ingredient-correction-memory.ts` ~371 |
| 4 | `selectIngredientForItem` | `invoices.tsx` ~1921 |
| 5 | `persistIngredientCorrectionForItem` | `invoices.tsx` ~1702 |
| 6 | `persistManualIngredientCorrection` → `upsertConfirmedAlias` | `ingredient-correction-memory.ts` |
| 7 | `persistOperationalIngredientCostFromInvoiceLine` | `ingredient-auto-persist.ts` ~99 |
| 8 | `appendIngredientPriceHistoryFromInvoiceLine` | `ingredient-price-history.ts` ~458 |
| 9 | `dispatchOperationalIngredientCostChanged` (new id only) | `resolve-operational-ingredient-cost.ts` ~643 |

### Scenario B — "No match"

| Finding | Evidence |
|---------|----------|
| No UI action | `InvoiceIngredientCorrectionPicker` — no sentinel option |
| No handler | `handleSelectCorrectionIngredient` requires `ingredientId: string` |
| `rejectIngredientMatchSuggestion` | Defined in `ingredient-correction-memory.ts` ~350; **zero callers** in `src/routes` |
| `rejectedMatchItemIds` | Only **cleared** on rematch; never **set** in production UI |

---

## Ten Questions — Evidence

| # | Question | Answer |
|---|----------|--------|
| 1 | Code path when match changed? | `handleSelectCorrectionIngredient` → `persistIngredientCorrectionForItem` chain (above) |
| 2 | Tables updated? | **Yes:** `ingredient_aliases`, `ingredients` (new target), `ingredient_price_history` (new target), localStorage. **No:** `invoice_items`, old-target history/price |
| 3 | `ingredient_price_history`? | **Old target untouched.** New target INSERT/UPDATE. Reconcile only on re-extract UPDATE or invoice delete |
| 4 | `ingredients.current_price`? | **New target:** immediate. **Old target (635a1189):** never reverted by correction |
| 5 | Supplier intel recalculated? | **Partially** — live matcher scan stops conserva attribution after reject pair; DB history row remains |
| 6 | OI recalculated? | **Partially** — cost-changed event for new id only; raw history on conserva unchanged |
| 7 | Aliases modified? | **UPSERT** Pepino → new ingredient. No delete of wrong link (none existed for bare Pepino) |
| 8 | Historical chains repaired? | **No** — `reconcileIngredientPriceHistoryChain` not invoked on correction |
| 9 | Orphaned records? | **Yes** — `a689bd91` on conserva; possible dual `(invoice_id, ingredient_id)` rows |
| 10 | Fully reverses contamination? | **No** — verdict **2 partially** |

---

## Scenario A — Change to different ingredient

### What changes (forward-looking)

- `rejectIngredientMatchPair` → localStorage `marginly:rejected-ingredient-matches:{userId}` blocks Pepino→635a1189 in matcher (`ingredient-rejected-match-memory.ts`)
- `ingredient_aliases` UPSERT: Pepino line text → `newIngredientId`
- `ingredient_price_history` INSERT/UPDATE for `(da472b7f, newIngredientId)`
- `ingredients.current_price` updated for **new** ingredient
- `dispatchOperationalIngredientCostChanged({ trigger: "invoice_manual_match" })`

### What does NOT change (backward-looking)

- History row `a689bd91` on Pepino conserva — **untouched**
- `ingredients.current_price` on 635a1189 — **not reverted**
- `reconcileIngredientPriceHistoryChain` — **not called**
- Jar aliases on conserva — unchanged

### Create new "Pepino fresco" from confirmed row

- **Not available** in UI — `Create new ingredient` only when `unmatchedIngredient || suppressMatchPresentation` (`invoices.tsx` ~3437)
- Confirmed Pepino shows **Correct match** only (picker → existing catalog entries)
- Create flow (`saveCanonicalIngredientFromInvoiceRow`) does **not** call `rejectIngredientMatchPair`

---

## Scenario B — "No match"

**Current behavior:** No production path. Initial contamination fully persists.

**Code that exists but is unwired:**

- `rejectIngredientMatchPair` — only when rematching to a **different** ingredient
- `rejectIngredientMatchSuggestion` — tests only
- `resolveIngredientCorrectionUiState` rejected branch — unreachable without UI populating `rejectedMatchItemIds`

---

## Observations

- Correction is **additive** — writes new-target state without **subtractive** cleanup on old target.
- `rejectIngredientMatchPair` comment: *"Does not mutate catalog, aliases, or dropdown options"* (`ingredient-correction-memory.ts` ~368).
- `traceAliasUnmatchOrphan`: *"ingredient_aliases row may remain"* (`ingredient-correction-memory.ts` ~401).
- `reconcileIngredientPriceHistoryChain` deletes only `invoice_id IS NULL` orphans and rechains **surviving linked rows** — triggered on invoice **delete** or history **refresh**, not correction (`ingredient-price-history-reconcile.ts` ~124).
- Pepino bare word had **no alias** on conserva — rejection memory is the only conserva-specific block; poison is in **price_history**, not aliases.

---

## Calculations

After hypothetical correction to new ingredient `NEW_ID`:

| Artifact | Count on `da472b7f` |
|----------|---------------------|
| History on conserva (635a1189) | 1 (orphan `a689bd91`) |
| History on NEW_ID | +1 (new write) |
| **Dual attribution same invoice** | **2 rows possible** |

---

## Hypotheses

1. Correction was designed for **rematch**, not **unmatch** — forward alias + cost on new target only.
2. Historical poison is considered **invoice-linked immutable** until invoice delete triggers reconcile.
3. Live matcher rejection gives **UI-level** fix without **DB-level** history hygiene.

---

## Verdict

| Code | Meaning | Applies to |
|------|---------|------------|
| **1** | Fully reverses | — |
| **2** | Partially reverses | **Scenario A** — stops live match; poison persists in DB |
| **3** | Does not reverse | **Scenario B** — no handler |

**Overall: 2 — partially reverses** (93% confidence)

---

## Artifacts

| File | Contents |
|------|----------|
| `correction-timeline.json` | Scenario A/B step timeline |
| `write-paths.json` | Code paths and reconcile triggers |
| `data-reverted.json` | What correction updates |
| `data-not-reverted.json` | Orphans and untouched poison |
| `verdict.json` | Ten questions + verdict codes |
