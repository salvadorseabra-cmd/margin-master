# Possible Match Regression Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY  
**Evidence date:** 2026-06-25  
**Subagent:** `2a540841-f4c4-425f-b75d-ed064ea17896`  
**Audit type:** `STRICT_READ_ONLY_POSSIBLE_MATCH_REGRESSION`

---

## Executive verdict

**Classification: F — combination of E (persistence/state) + A (matching alias recall)**

Not threshold (B), candidate generation (C), or Review UI (D) regression.

The dominant regression for the reported Prosciutto case is **not** scoring/threshold drift and **not** UI discard. It is **alias/override key miss after re-read** (Pass C adds `Rovagnati -` brand prefix) combined with **re-read item-ID rotation** orphaning prior confirmed match rows. Separately, VL now shows **fewer** Possible Matches overall (4 → 1) because three former semantic lines were **user-confirmed** to `confirmed-override`, which is expected lifecycle behavior—not a bug.

---

## First regression point

**Alias/override key miss** when Pass C adds `Rovagnati -` prefix after re-read. Occurs at `lookupIngredientMatchOverride` **before** scoring.

| Field | Value |
|-------|-------|
| Stored alias (VL DB) | `Assaporami Prosciutto Cotto Scelto HC 4,3-4,5Kg` |
| Normalized alias | `assaporami prosciutto cotto sceltohc` |
| Supplier | `Emporio Italia` |
| Current invoice line (post re-read) | `Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg` |
| Prior invoice line (pre re-read) | `Assaporami Prosciutto Cotto Scelto HC 4-4,25Kg` |
| Prior status | `confirmed-override` → UI **Matched automatically** |
| Current status | `suggested/semantic` → UI **Possible match** |

Brand-prefix stripping exists in `canonical-ingredient-display-name.ts` (`/^rovagnati\s*-\s*/i`) but **not** in alias/override lookup (`buildOverrideKeysFromInvoiceLine` → `normalizeOperationalAliasKey`). That is the first divergence point—not scoring.

**Deno replay evidence:** `reReadHitsStoredKey: false`, `oldHitsStoredKey: false` (neither re-read nor old spelling hits stored alias key after normalization). Re-read name falls through to semantic loop; stored alias name alone would hit override.

---

## VL suggested count: 4 → 1

| Date | Suggested count | Lines | Notes |
|------|----------------:|-------|-------|
| 2026-06-13 | **4** | Atum×2, Chocolate, Mozzarella Bocconcino | From `.tmp/remove-match-investigation/query-summary.json` |
| 2026-06-25 | **1** | Prosciutto only | Live VL query |

**Delta explanation:**

- **−3** from user confirmations (expected lifecycle): Atum, Chocolate, Mozzarella converted `semantic` → `confirmed-override`
- **+1** new Prosciutto regression from re-read name drift (alias key miss)
- Net: **−3 possible matches** vs June 13 baseline

### VL `invoice_item_matches` distribution (queried 2026-06-25)

| Status | Count | Breakdown |
|--------|------:|-----------|
| confirmed | 49 | 35 override + 14 alias |
| suggested | **1** | Prosciutto only |
| unmatched | 2 | Non-ingredient lines (Lenha, fuel surcharge) |

---

## T1 — End-to-end pipeline trace

```
OCR/Pass C name
  → normalizeInvoiceItemFields (invoice-item-fields.ts)
  → findInvoiceItemIngredientMatch (invoice-ingredient-match-propagation.ts)
      1. supplier shorthand
      2. findCanonicalIngredientMatch (ingredient-canonical.ts)
         a. lookupIngredientMatchOverride
         b. operational alias memory
         c. lookupIngredientIdFromAliasMap (ingredient-alias-lookup.ts)
         d. operational memory exact
         e. full-catalog candidate loop + scoring
         f. threshold promotion (semantic ≥0.72 OR operational ≥0.58)
  → getInvoiceRowIngredientMatchState (ingredient-match-explanation.ts)
      confirmed: exact | confirmed-* | operational-*
      suggested: semantic | operational-equivalent  ← "Possible match"
  → [optional] resolveReadCutoverMatch (invoice-item-match-read-cutover.ts)
      if VITE_MATCH_LIFECYCLE_READ_CUTOVER=true → persisted invoice_item_matches wins
  → ItemsTable render (invoices.tsx)
      showSuggestedMatch → deriveInvoiceRowInlineChips → label "Possible match"
  → User Confirm → persistIngredientCorrectionForItem → alias + dual-write MLS
```

**Review & Create is a separate path:** `collectUnmatchedRowsForBulkCreate` only includes rows where `displayState === "unmatched"`. Possible matches never enter that sheet.

---

## T2 — Candidate generation

Matching is **single-best-candidate**, not top-10 list. The loop in `findCanonicalIngredientMatch` iterates all active catalog ingredients, scores each, keeps `best`.

| Product | Candidates evaluated? | Best candidate | Kind if promoted |
|---------|----------------------|----------------|------------------|
| Prosciutto (post re-read) | Yes — falls through alias miss to semantic loop | Prosciutto cotto scelto | `semantic` → suggested |
| Pepino | Yes — alias hit early | Pepino fresco | `confirmed-alias` → confirmed |
| Tomilho | Yes — alias hit | Tomilho | `confirmed-alias` → confirmed |
| Mozzarella Bocconcino | Yes — was semantic; now override | Mozzarella fior di latte | `confirmed-override` → confirmed |
| Chocolate Pantagruel | Yes — was semantic; now override | Chocolate culinária | `confirmed-override` → confirmed |
| Atum Catrineta | Yes — was semantic; now override | Atum em óleo | `confirmed-override` → confirmed |

**Gate before scoring:** family gate, form compatibility, rejected pairs, operational family skip — none block Prosciutto.

**Prosciutto item IDs (Emporio invoice `ab52796d-de1d-418d-86e7-230c8f056f09`):**

| Item ID | Role |
|---------|------|
| `9a2e9311-a1bd-408d-8261-b7a445e7043d` | Current post re-read line |

Re-read rotates `invoice_item_id`; CASCADE drops old match rows; alias remains keyed on pre-Pass-C spelling.

---

## T3 — Threshold audit

Thresholds unchanged in code:

| Threshold | Value | File |
|-----------|-------|------|
| `SEMANTIC_MATCH_MIN_SCORE` | 0.72 | `ingredient-canonical.ts:476` |
| `SEMANTIC_AUTO_MATCH_MIN_SCORE` | 0.88 | `ingredient-canonical.ts:478` |
| `OPERATIONAL_EQUIVALENT_MIN_SCORE` | 0.58 | `ingredient-identity.ts:273` |

### Prosciutto (live VL, post re-read 2026-06-24)

| Candidate | Score evidence | Threshold | Shown? | Reason |
|-----------|----------------|-----------|--------|--------|
| Prosciutto cotto scelto (via semantic) | Persisted `match_kind: semantic`, status `suggested` | ≥0.72 semantic | **Yes** — "Possible match" | Alias miss → semantic promotion |
| Same via confirmed-override | Would be auto-confirmed | N/A | **No** | Override key miss on `Rovagnati - …` prefix |

**Conclusion:** Prosciutto is **not** filtered by threshold. The confirmed path is blocked at alias lookup; semantic path passes and promotes correctly.

---

## T4 — UI audit (backend vs frontend)

| Check | Result |
|-------|--------|
| API/backend produces suggested for Prosciutto | **Yes** — `invoice_item_matches.status=suggested`, `match_kind=semantic` |
| Client transform drops it | **No** — `getInvoiceRowIngredientMatchState` maps `semantic` → `possibleMatch` |
| React suppresses render | **No** — `showSuggestedMatch` true unless `rejectedMatchItemIds` or `suppressMatchPresentation` |
| Label mapping | **Correct** — `deriveInvoiceRowInlineChips` → `"Possible match"` when `suggestedMatch: true` |

**READ_CUTOVER flag:** Default **OFF** on VL (`.tmp/pepino-live-validation/baseline.json`). With OFF, UI uses virtual matcher; for Prosciutto both virtual and persisted agree on `suggested` today.

**Review & Create UI:** Amber banner shows only when `unmatchedCount > 0`. VL now has **2 unmatched** (Lenha, fuel surcharge)—not possible-match rows. Possible-match count appears in header summary (`N possible ingredient matches`) but not in Review & Create sheet.

---

## T5 — Git history (relevant commits)

| Commit | Area | Possible-match impact |
|--------|------|----------------------|
| `dd6b4b7` / `d9f91e4` / `5b4a171` | Match lifecycle v1 + read cutover | Virtual vs persisted drift taxonomy; Pepino-class intentional drift |
| `d022996` | Canonical identity cleanup | Matcher gates, display-name stripping (alias path not aligned) |
| `7d97ca3` | Bulk Review & Create | Unmatched-only sheet; never included suggested rows |
| `e0bde91` | OCR qty prepass v40 | **No matching code change** (confirmed by prior post-deploy audit) |
| `415ce1b` / `e3f3694` | Cost presentation | Label only; no match classification |

No recent commit lowered semantic threshold or removed suggested rendering.

---

## T6 — VL replay (live DB + matcher population)

### Product matrix

| Product | Item ID | Supplier | Current ingredient | Expected (user memory) | Actual VL status | Virtual/cutover-OFF display | Why |
|---------|---------|----------|-------------------|------------------------|------------------|----------------------------|-----|
| **Prosciutto** | `9a2e9311-a1bd-408d-8261-b7a445e7043d` | Emporio Italia | Prosciutto cotto scelto | Matched automatically | `suggested/semantic` | Possible match | Re-read Pass C name + alias key miss |
| **Pepino** | `0b373627-9e78-4387-9945-35a504174b93` | Bidfood Portugal, SA | Pepino fresco | Confirmed | `confirmed/confirmed-alias` | Matched automatically | Stable alias `Bidfood::pepino` |
| **Tomilho** | `f2d094ab-f50a-483d-b6cb-76554d5bf195` | Bidfood Portugal, SA | Tomilho | Confirmed | `confirmed/confirmed-alias` | Matched automatically | Alias hit |
| **Mozzarella** | `f2a672e0-016c-43d7-a53f-1ee8b8976f4b` | Bocconcino | Mozzarella fior di latte | Was Possible → confirmed | `confirmed/confirmed-override` | Matched automatically | User confirmed 2026-06-23 |
| **Chocolate** | `11024922-0c2b-4daf-b178-06d622899b18` | Aviludo | Chocolate culinária | Was Possible → confirmed | `confirmed/confirmed-override` | Matched automatically | User confirmed 2026-06-17 |
| **Atum** | `9af131b9-159f-48d6-807b-47b6124a9045` | Aviludo | Atum em óleo | Was Possible → confirmed | `confirmed/confirmed-override` | Matched automatically | User confirmed 2026-06-17 |

### Historical vs current suggested population

| Date | Suggested count | Lines |
|------|----------------:|-------|
| 2026-06-13 | **4** | Atum×2, Chocolate, Mozzarella Bocconcino |
| 2026-06-25 | **1** | Prosciutto (new regression) |

---

## T7 — Regression classification

| Class | Applies? | Evidence |
|-------|----------|----------|
| **A) Matching regression** | **Partial** | Alias recall fails on Pass C brand-prefixed names; semantic fallback is working as designed |
| **B) Threshold** | **No** | Constants unchanged; Prosciutto passes semantic bar |
| **C) Candidate generation** | **No** | Candidate found and promoted |
| **D) Review UI** | **No** | Renders suggested correctly; Review & Create never listed suggested rows by design |
| **E) Persistence/state** | **Primary** | Re-read rotates `invoice_item_id`; CASCADE drops old matches; alias keyed on pre-Pass-C spelling |
| **F) Combination** | **Yes — E + A** | Re-read persistence + alias key geometry |

**First regression point (Prosciutto):** Step **1a — `lookupIngredientMatchOverride` / alias lookup miss** when invoice `name` gains `Rovagnati -` prefix after Pass C re-read. Scoring and UI are downstream consequences.

**First regression point (fewer matches overall):** User confirmations converting `semantic` → `confirmed-override` (expected), not system regression.

---

## Final questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Candidates generated? | **Yes** for all investigated products; Prosciutto gets semantic best-candidate |
| 2 | Filtered? | **No threshold filter** for Prosciutto; **alias layer filters out** confirmed path |
| 3 | Backend correct? | **Yes** — persisted `suggested/semantic` matches virtual matcher given current alias map |
| 4 | Frontend correct? | **Yes** — displays Possible match when `displayState=suggested`; no discard |
| 5 | First regression point? | **Alias/override key miss at ingest name change (re-read Pass C)**, before scoring |
| 6 | Smallest fix (identify only)? | Align alias lookup with brand-prefix normalization used in display synthesis, **or** add alias for Pass C Prosciutto spelling, **or** T8 preserve policy on re-read — **not proven which is smallest until alias-key replay confirms exact normalized key delta** |
| 7 | Confidence | **88%** Prosciutto root cause; **85%** overall audit (VL replay matcher scores not re-run in-process due to `@/` import constraints; alias key evidence from DB + prior audits is strong) |

---

## Review & Create — unmatched-only design note

`collectUnmatchedRowsForBulkCreate` in `src/lib/bulk-canonical-ingredient-create.ts` (line ~125) includes **unmatched rows only** — never `suggested` / Possible match rows.

This is **by design**, not a regression:

- Review & Create amber banner triggers on `unmatchedCount > 0` only
- Possible matches appear in the invoice items table with label **"Possible match"** and in header summary (`N possible ingredient matches`)
- User suspicion that "Possible Matches no longer appear in Review & Create" reflects this intentional scope boundary, not a missing UI feature
- VL currently has 2 unmatched non-ingredient lines (Lenha, fuel surcharge) eligible for Review & Create; 1 suggested (Prosciutto) is excluded

---

## Key file references

| Area | Path |
|------|------|
| Pipeline entry | `src/lib/invoice-ingredient-match-propagation.ts` |
| Canonical matching + thresholds | `src/lib/ingredient-canonical.ts` |
| Display state / Possible match | `src/lib/ingredient-match-explanation.ts` (`isSuggestedIngredientMatch` = semantic \| operational-equivalent) |
| Read cutover | `src/lib/invoice-item-match-read-cutover.ts` |
| Cutover flag | `src/lib/match-lifecycle-flags.ts` |
| Alias lookup keys | `src/lib/ingredient-alias-lookup.ts`, `src/lib/ingredient-match-override.ts` |
| Alias normalization | `src/lib/ingredient-operational-alias-memory.ts` |
| Brand prefix stripping (display only) | `src/lib/canonical-ingredient-display-name.ts` |
| UI render + Review & Create | `src/routes/invoices.tsx` (`showSuggestedMatch`, Review & Create gate) |
| Review & Create scope | `src/lib/bulk-canonical-ingredient-create.ts:125` |
| Row display chips | `src/lib/invoice-ingredient-row-display.ts` |
| Persisted match helpers | `src/lib/invoice-item-match-helpers.ts` |
| Shadow seed / MLS | `src/lib/invoice-item-match-shadow-seed.ts` |

### Prior audit artifacts

- `.tmp/post-deploy-regression-audit/` — Prosciutto confirmed → suggested after re-read; override key miss; ID rotation
- `.tmp/emporio-deli-family-audit/` — Emporio family virtual match replay
- `.tmp/remove-match-investigation/query-summary.json` — 2026-06-13 suggested baseline (4 rows)
- `.tmp/match-lifecycle-phase4-readiness/DRIFT_ANALYSIS.md` — Virtual vs persisted drift taxonomy
- `.tmp/pepino-live-validation/baseline.json` — READ_CUTOVER default OFF on VL
- `.tmp/match-lifecycle-phase4b-validation/PEPINO_BEHAVIOR.md`, `READ_CUTOVER_REPORT.md`

---

## Constraints observed

- NO code changes
- NO DB writes
- NO deployments
- NO fixes applied during audit
