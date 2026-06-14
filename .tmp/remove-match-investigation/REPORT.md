# Remove Match / No Match — Investigation Report

**Mode:** READ-ONLY · **Generated:** 2026-06-13 · **Harness:** `.tmp/remove-match-investigation/run-investigation.mts`

---

## Executive Summary

The invoice review UI can **change** a match or **create** a new ingredient, but cannot **remove** a match. Matching is **virtual** — `invoice_items` has no `ingredient_id`. Pepino fresh ("Pepino", €1.77/kg, Bidfood) auto-linked to catalog **"Pepino conserva"** via `kind: exact` at extract time; cost sync wrote poisoned `ingredient_price_history` **without user confirm** and **without a "Pepino" alias**.

**Recommendation:** Ship a dedicated **"Remove match"** action with `rejectIngredientMatchPair` + **price history cleanup** for that invoice+ingredient. Optionally add **"— No match —"** in the picker. Gate extract auto-sync (Option C) as follow-up structural hardening.

---

## Context — Pepino Case

| Field | Value |
|-------|-------|
| Invoice line | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` (Bidfood) |
| Product | Pepino · 3.36 kg · €1.77/kg |
| Matched ingredient | Pepino conserva (`635a1189-36ea-4ff2-9012-8172ab1ab81d`) |
| Match kind | `exact` · displayState `confirmed` |
| Alias for "Pepino" | **None** (6 aliases are jar product names only) |
| Poisoned history | `a689bd91` · new_price `0.00177` · delta −99.95% vs jars |

Prior audits: [identity-contamination-audit](../identity-contamination-audit/REPORT.md), [identity-expansion-simulation](../identity-expansion-simulation/REPORT.md), [historical-pricing-integrity-audit](../historical-pricing-integrity-audit/REPORT.md).

---

## TASK 1 — Match Persistence

### Architecture

Match is **not stored on `invoice_items`**. Resolution happens at read time via `resolveInvoiceTableRowIngredientMatch` (documented in `catalog-review-current-matches.ts`).

### Persistence layers

| Layer | Storage | Written when |
|-------|---------|--------------|
| `ingredient_aliases` | Supabase | Manual confirm, picker select, create-ingredient link |
| `confirmedIngredientAliases` | React + localStorage | Mirror of alias map after persist |
| `ingredient_match_override` | In-memory | Manual correction |
| `rejected-ingredient-matches` | localStorage | `rejectIngredientMatchPair` (wrong match only) |
| `rejectedMatchItemIds` | React session | UI suppress (not cross-device) |
| `ingredient_price_history` | Supabase | Extract sync + manual confirm/pick |

### Flow comparison

**A — Auto match on extract**

1. `invoice_items` inserted after OCR
2. `syncOperationalIngredientCostsFromInvoiceLines` runs immediately (`invoices.tsx` ~1358)
3. Skips only `unmatched` bucket — **both `confirmed` and `suggested` sync**
4. Writes `ingredients.current_price` + `ingredient_price_history`
5. **Does not** write aliases

**B — Manual change**

1. User opens picker ("Correct match") → selects ingredient
2. `rejectIngredientMatchPair` for **old** pair (if changing)
3. `persistIngredientCorrectionForItem` → alias upsert + cost sync

**C — Create new ingredient**

1. `saveCanonicalIngredientFromInvoiceRow` → new `ingredients` row
2. `persistIngredientCorrectionForItem` links line via alias

**D — Confirm suggested**

Same persist path as B without prior rejection.

→ Full trace: `match-flow-trace.json`

---

## TASK 2 — Unmatched State

### Schema facts

- `invoice_items`: `id, invoice_id, user_id, name, quantity, unit, unit_price, total, created_at, updated_at` — **no ingredient_id**
- Unmatched = matcher returns `null` → `displayState: unmatched`
- No DB column for match status; 40/51 VL lines unmatched today

### Downstream safety

Unmatched lines do **not** break downstream:

- Extract cost sync **skips** unmatched (`ingredient-operational-intelligence.ts:933`)
- Purchase memory scan **skips** unmatched bucket
- Bulk ingredient create targets unmatched only
- Emporio Ginger Beer: unmatched, no price_history — system stable

### VL live counts (Supabase query 2026-06-13)

| displayState | Count |
|--------------|-------|
| confirmed | 7 |
| suggested | 4 |
| unmatched | 40 |
| extract sync would run | 11 |

### Gap

`rejectIngredientMatchPair` blocks re-match via localStorage but **does not** remove aliases or history. No `deleteConfirmedAlias` app helper exists (DB DELETE policy exists on `ingredient_aliases`). `ingredient_price_history` DELETE RLS added in `20260609120000_ingredient_price_history_update_delete_rls.sql`.

→ Full trace: `schema-trace.json`

---

## TASK 3 — UI Trace

### Components

| UI element | Component | Action |
|------------|-----------|--------|
| "Matched to: X" chip | `InvoiceIngredientCorrectionPicker` | Opens dropdown |
| Ingredient dropdown | Same picker | `handleSelectCorrectionIngredient` |
| "Confirm match" | `IngredientCorrectionActions` | `confirmIngredientMatch` |
| "Correct match" | `IngredientCorrectionActions` | Opens same picker |
| "Create new ingredient" | ItemsTable button | `openCanonicalIngredientCreate` |

### Duplication analysis

**Dropdown and "Correct match" are not duplicate operations.** "Correct match" only opens the picker; both converge on `handleSelectCorrectionIngredient` → `persistIngredientCorrectionForItem`. "Confirm match" is a separate one-click path for **suggested** rows only.

### Missing capability

No "Remove match" / "— No match —". For Pepino (`confirmed`), user sees "Correct match" + "Matched to: Pepino conserva" but must pick **another** ingredient to change anything.

→ Full trace: `ui-trace.json`

---

## TASK 4 — Downstream Impact

| System | Remove match effect |
|--------|---------------------|
| ingredient_price_history | **B** — cleanup required for synced lines |
| ingredients.current_price | **B** — may need revert |
| purchase history / OI scan | **A** — stops future inclusion when unmatched |
| supplier intel | **A** future; **B** historical |
| opportunities / P0 guard | **A** read path; **B** raw DB until cleanup |
| recipe costing | **B** if price poisoned |
| catalog review counts | **A** — live matcher drops line |
| ingredient_aliases | **Conditional B** — Pepino has no line alias |

**Verdict:** Not future-only. Pepino history row `a689bd91` proves poison persists without cleanup.

→ Full trace: `risk-assessment.json`

---

## TASK 5 — Implementation Options

| Option | Summary | Complexity | Best for |
|--------|---------|------------|----------|
| **A** | Picker "— No match —" | Medium | Power users |
| **B** | Dedicated "Remove match" button | Medium | Pepino scenario |
| **C** | Gate extract auto-sync | High | Structural prevention |
| **D** | Reject pair only (minimal) | Low | Insufficient — orphan history |

→ Full trace: `implementation-options.json`

---

## TASK 6 — Recommendation

| Question | Answer |
|----------|--------|
| Technically feasible? | **Yes** (92%) |
| Backend supports unmatched? | **Yes** (95%) — 40/51 VL lines prove it |
| Schema change required? | **No** for core feature; DELETE RLS exists for price history |
| Historical cleanup required? | **Yes** (88%) |
| Smallest safe implementation? | **Option B** + history delete + `rejectIngredientMatchPair` |
| Recommended UX? | **"Remove match"** link + confirm dialog |

### Would "No match" have prevented Pepino contamination?

**PARTIALLY (86% confidence)**

| Timing | Prevents? |
|--------|-----------|
| Before extract (UI only) | **No** — sync runs immediately post-insert; Pepino `exact`/`confirmed` auto-syncs |
| After extract (reject pair only) | Display yes; **poison remains** |
| After extract (full cleanup) | **Yes** |
| Extract sync gated (Option C) | **Yes** — would stay suggested until user confirms |

**Evidence:** Live matcher returns Pepino → Pepino conserva `kind: exact`, `wouldSyncOnExtract: true`. Expansion simulation rated canonical match "SAFE" — matcher blind spot. Human "no match" is the correct fix; UI did not offer it.

→ Full trace: `recommendation.json`

---

## Artifacts

| File | Contents |
|------|----------|
| `match-flow-trace.json` | Persistence layers + flows A/B/C/D |
| `schema-trace.json` | Schema + VL query + Pepino case + unmatched examples |
| `ui-trace.json` | Components + state machine + duplication analysis |
| `risk-assessment.json` | Downstream A vs B impact |
| `implementation-options.json` | Options A–D comparison |
| `recommendation.json` | Six questions + Pepino verdict |
| `run-investigation.mts` | Read-only Supabase + matcher harness |

---

## Hypotheses

1. **Extract auto-sync is the primary contamination vector** for high-confidence wrong `exact` matches — UI review comes too late.
2. **`rejectIngredientMatchPair` was designed for rematch, not unmatch** — orphan alias/history is intentional tradeoff documented in `traceAliasUnmatchOrphan`.
3. **Cross-device unmatch needs Supabase writes** (alias/history); localStorage rejection alone is insufficient for multi-browser ops teams.

---

## Calculations

- Unmatched rate: 40/51 = **78%** of VL lines
- Auto-sync surface: 11/51 = **22%** of lines write cost on extract
- Pepino delta: (0.00177 − 3.748) / 3.748 ≈ **−99.95%** (stored in history row after May jar baseline)
