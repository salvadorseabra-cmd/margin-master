# Gorgonzola Final Closure Investigation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio Italia)  
**Item:** `5fab58a8-8cfc-4625-ab97-e956d07aade9`  
**Ingredient:** `1526106c-7bac-4b70-bd51-7b0fd5cc89ed` — Gorgonzola DOP dolce  
**Mode:** READ-ONLY · **Queried:** 2026-06-25T11:43Z (live VL Supabase)  
**Evidence:** `.tmp/gorgonzola-final-closure/results.json`, `.tmp/gorgonzola-final-closure/replay.mts`, `.tmp/gorgonzola-final-closure/full-replay.mts`

---

## Certification Decision

### 🟢 CERTIFIED — Gorgonzola case may close

Economics, catalog sync, persisted matching, **virtual read path**, and validation all align on the live VL row. The prior 🟡 certification was driven by a **flawed audit alias map** in `.tmp/gorgonzola-final-certification/audit.mts` (wrong key order and value shape). Replaying with production `buildConfirmedAliasMapFromRows` + full catalog shows `displayState: confirmed` with read cutover **OFF**.

**Matching Read Cutover is not a Gorgonzola blocker.** It remains a platform rollout item for lines that lack a confirmed-alias virtual hit, but this line resolves via `confirmed-alias` before cutover is consulted.

---

## 1. Live database truth

| Table | Key fields | Live value |
|-------|------------|------------|
| `invoice_items` | `5fab58a8…` | 1.35 kg · €9.95 · €13.44 · Castelfrigo line name |
| `invoice_item_matches` | `invoice_item_id`, `ingredient_id`, `status` | `5fab58a8…` → `1526106c…` · **`confirmed`** · `match_kind: confirmed-override` |
| `ingredients` | `current_price`, `purchase_quantity` | **9.95** · **1000 g** · updated 2026-06-25 |
| `ingredient_aliases` | `confirmed_by_user`, `supplier_name` | **true** · Emporio Italia · exact line alias |
| `ingredient_price_history` | latest `new_price` | 0.00995 €/g (€9.95/kg) · `previous_price` / `delta` **null** |

Only one Gorgonzola `invoice_items` row exists; stale historical rows remain absent.

---

## 2. Invoice Review read path

```
load() [invoices.tsx]
  → invoice_items (all invoices)
  → ingredient_aliases WHERE confirmed_by_user = true
  → loadConfirmedIngredientAliasMap() → buildConfirmedAliasMapFromRows()
  → [if READ_CUTOVER] invoice_item_matches → persistedMatchByItemId
  → ItemsTable render per row:
       resolveInvoiceTableRowIngredientMatch(
         name, catalog, confirmedAliases, supplierName,
         trace,
         buildCutoverContextForInvoiceItem(id, persistedMatchByItemId)  // only when cutover ON
       )
```

**Which source wins (read cutover OFF — current VL `.env.local`):**

| Step | Source | Gorgonzola outcome |
|------|--------|-------------------|
| 1 | Virtual matcher (`resolveInvoiceRowIngredientMatch`) | **Wins** — `lookupIngredientIdFromAliasMap` hits operational key `emporio italia::gorgonzoladop dolce linea castelfrigo` |
| 2 | `resolveReadCutoverMatch` | Skipped — `isMatchLifecycleReadCutoverEnabled()` → **false** |
| 3 | `persistedMatchByItemId` prop to ItemsTable | **`undefined`** when cutover off (`invoices.tsx:2836–2839`) |

**Production replay** (`full-replay.mts`, full VL catalog + `buildConfirmedAliasMapFromRows`):

| Path | `displayState` | `kind` | Ingredient |
|------|----------------|--------|------------|
| Virtual (default) | **confirmed** | **confirmed-alias** | Gorgonzola DOP dolce |
| With persisted context, cutover still off | **confirmed** | **confirmed-alias** | same |

**Why prior certification reported `unmatched`:** `audit.mts` used a local `buildConfirmedAliasMap` with keys `normalized_alias::supplier` and object values — not `buildIngredientAliasLookupKey` / `buildConfirmedAliasMapFromRows`. That map never matches production lookup keys, so the audit falsely reported virtual miss.

---

## 3. Match lifecycle env vars

From `.env.local` (VL project):

| Variable | Value | Effect on Invoice Review |
|----------|-------|------------------------|
| `VITE_MATCH_LIFECYCLE_READ_CUTOVER` | **unset → OFF** | Persisted `invoice_item_matches` **not** loaded or applied on read |
| `VITE_MATCH_LIFECYCLE_DUAL_WRITE` | **true** | Writes to `invoice_item_matches` on confirm (explains confirmed DB row) |
| `VITE_MATCH_LIFECYCLE_SHADOW_SEED` | **true** | Shadow seed on extract |
| `VITE_MATCH_LIFECYCLE_WRITE_CUTOVER` | **does not exist** | Platform uses `DUAL_WRITE`, not a separate write cutover flag |

Invoice Review is still on **legacy virtual-first read** globally, but Gorgonzola's confirmed DB alias makes the virtual path return **confirmed** without read cutover.

---

## 4. UI state — what should display

| Surface | Expected | Replay evidence |
|---------|----------|-----------------|
| Match badge | **Matched** (confirmed) — linked to Gorgonzola DOP dolce | `displayState: confirmed`, `kind: confirmed-alias` |
| Unmatched / Suggested / Review badges | **None** for matching | `validateMatchingFindings` → `[]` |
| Economics | 1.35 kg · €9.95/kg · €13.43–13.44 total | unchanged from prior certification |
| KPI unmatched count | Should **not** increment this line | virtual bucket = `matched` |

If a browser session still shows Unmatched, likely causes (not reproduced in replay): empty catalog on first paint, local alias map desync, or rejected-match memory for this pair — none observed in live DB.

---

## 5. Validation

`validateInvoiceLine()` with production resolution (`matchDisplayState: confirmed`):

| Validator | Result |
|-----------|--------|
| Extraction | `[]` |
| Mathematics | `[]` (1.35 × 9.95 ≈ 13.44) |
| Operational | `[]` |
| Matching | `[]` |

**All codes: `[]`** — matching finding only fires when `matchDisplayState` is `unmatched` or `suggested`.

---

## 6. Remaining issues (non-blocking for Gorgonzola closure)

| Issue | Blocks Gorgonzola? | Notes |
|-------|-------------------|-------|
| Read cutover OFF globally | **No** for this line | Virtual alias hit suffices; cutover needed for other lines without alias |
| Price history `previous_price` / `delta` null | No | In-place correction 10.88 → 9.95 not auditable |
| OCR per-stage trace for 2026-06-25 re-extract | No | End-state converged; intermediate stages not archived |
| Re-extract stability (N× probe) | No for closure | Emporio fractional-kg GPT variance documented |
| Certification audit script alias map | No (fixed in understanding) | `audit.mts` should use `buildConfirmedAliasMapFromRows` |

---

## Smallest fix (do NOT implement — documentation only)

**For Gorgonzola:** **No code change required.** Case is closed on live data + production read path.

**If Unmatched still appears in a specific browser session:**

1. Hard refresh after catalog/alias load completes (catalog length > 0).
2. Optional platform fix: enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` in VL so persisted `invoice_item_matches` wins regardless of alias map — benefits lines without virtual alias hits (Guanciale-class), not required here.

**Audit hygiene:** Fix `.tmp/gorgonzola-final-certification/audit.mts` to import `buildConfirmedAliasMapFromRows` instead of the hand-rolled map (prevents false `unmatched` in future audits).

---

## Return to parent

| Field | Value |
|-------|-------|
| **Certification** | 🟢 **CERTIFIED** |
| **Remaining issues** | None blocking Gorgonzola. Platform read cutover still OFF (other lines). Minor: price-history delta, OCR stage artifact, re-extract stability probe, audit script alias map bug. |
| **Smallest fix** | None for Gorgonzola; optional global `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true` for non-alias lines |
| **Confidence** | **91%** — live DB + full-catalog production replay agree; not live-browser verified this session |
