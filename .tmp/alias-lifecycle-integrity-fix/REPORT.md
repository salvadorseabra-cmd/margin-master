# Alias Lifecycle Integrity Fix

**VL:** `bjhnlrgodcqoyzddbpbd` · **Generated:** 2026-06-25T01:32:44.184Z · **Source:** live_vl_rls_empty_fixture

## Verdict: **PASS**

---

## Ownership rule

When a confirmed alias is assigned to ingredient **B**, any row with the same **supplier + normalized_alias** on ingredient **A** (A ≠ B) is **deleted** before upsert. At most one ingredient owns each ownership key.

Scope is **strict**: only identical `supplier_name` + `normalized_alias` pairs are deduped. Distinct suppliers or aliases on the same ingredient are untouched.

---

## Lifecycle trace

| Step | Path | Behavior (before) | Behavior (after fix) |
|------|------|-------------------|----------------------|
| 1 | Confirm Match | `persistManualIngredientCorrection` → `upsertConfirmedAlias` | Same; global ownership enforced |
| 2 | Review & Create | New ingredient + alias insert; stale row on wrong ingredient **left behind** | Stale row **deleted** before assign |
| 3 | Repeated confirm | Update on target ingredient | Unchanged |
| 4 | Invoice auto-alias | `persistInvoiceLineAliasMemory` → `upsertConfirmedAlias` | Stale ownership released |
| 5 | Alias map reload | `buildConfirmedAliasMapFromRows` — last row wins on collision | Collisions prevented at write |

**Root cause (mozzarella):** Premature confirm on fior di latte (2026-06-15) before julienne ingredient existed; Review&Create (2026-06-16) added correct alias but did not remove stale row.

---

## Before / after replay

| Metric | Before (fixture replay) | After simulation |
|--------|-------------------------|------------------|
| Total aliases | 2 | 1 |
| Ownership collisions | **1** | **0** |
| Stale rows removed | — | `5ec7b0f7…` (fior di latte) |

Live VL scan (live_vl_rls_empty_fixture): 2 confirmed aliases visible via anon key (RLS may limit read); fixture replays the audited mozzarella collision from `.tmp/duplicate-alias-collision-audit/`.

---

## Regression matrix

| Scenario | Result |
|----------|--------|
| Confirm Match | PASS — insert when no prior ownership |
| Review & Create | PASS — stale ownership removed before assign |
| Repeated confirms | PASS — update target row only |
| Supplier changes | PASS — distinct supplier scopes independent |
| Prosciutto | PASS — unrelated aliases untouched |
| Mozzarella Julienne | PASS — stale fior-di-latte row released on re-confirm |
| No duplicate ownership | PASS |

---

## Test results

`npx vitest run src/lib/ingredient-alias-memory.test.ts` — **10/10 PASS**

Affected suites: `ingredient-alias-memory.test.ts`, `ingredient-correction-memory.test.ts`, `ingredient-alias-lookup.test.ts`

---

## Changed files

- `src/lib/ingredient-alias-memory.ts`
- `src/lib/ingredient-alias-memory.test.ts`

---

## Blast radius

**LOW** — write-path change in `upsertConfirmedAlias` only. Historical confirms, overrides, and distinct supplier scopes unchanged. Model D **not** implemented.

---

## Model D readiness

Fix prevents new collisions. Deploy code first; stale VL row (`5ec7b0f7…`) clears on next julienne re-confirm or one-row delete.
