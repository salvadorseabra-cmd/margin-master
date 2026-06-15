# Risk Assessment

**Planning date:** 2026-06-15  
**Scope:** Per-phase risk classification for canonical identity rollout

---

## Summary matrix

| Risk domain | Phase 1 | Phase 2 | Phase 3 |
|-------------|---------|---------|---------|
| **Regression (existing good paths)** | LOW | LOW–MED | MED |
| **Catalog contamination** | LOW | LOW | MED |
| **Invoice matching** | LOW | LOW | LOW |
| **Alias memory** | LOW | LOW | LOW |
| **Purchasing / purchase unit** | LOW | LOW | LOW |
| **Historical pricing** | LOW | LOW | LOW |
| **Recipe / prep recipe costing** | LOW | LOW | MED |

---

## Phase 1 — Guard UX

| Risk | Level | Detail |
|------|-------|--------|
| Regression | **LOW** | UI + defaults only; Bocconcino operational path unchanged |
| Catalog contamination | **LOW** | User still confirms; submit validation unchanged |
| Matching | **LOW** | Suggestion path only; no matcher changes |
| Purchasing | **LOW** | `buildIngredientInsertPayload` independent |
| Historical pricing | **LOW** | Keyed on ingredient ID, not suggestion logic |
| Recipe | **LOW** | No catalog writes without user confirm |

**Mitigation:** `shouldBlockCanonicalNameOnCreate` still blocks true shorthand from pass-through pre-fill.

---

## Phase 2 — Normalization

| Risk | Level | Detail |
|------|-------|--------|
| Regression | **LOW–MED** | Over-stripping product identity (ibérica, fior di latte) |
| Catalog contamination | **LOW** | Improved cleanup on persist; user confirms name |
| Matching | **LOW** | Matcher uses `canonicalizeIngredientIdentity`, not display cleanup |
| Purchasing | **LOW** | Purchase format parser independent |
| Historical pricing | **LOW** | No ID changes for existing ingredients |
| Recipe | **LOW** | Only affects new creates / manual renames |

**Mitigation:** Extend tests in `canonical-ingredient-display-name.test.ts`; category-aware keep rules for ibérica/fior di latte.

---

## Phase 3 — Ontology seed

| Risk | Level | Detail |
|------|-------|--------|
| Regression | **MED** | Wrong category rule on novel products |
| Catalog contamination | **MED** | One-click accept on wrong ontology mapping |
| Matching | **LOW** | Only if ontology wrongly synced to matcher — **must not do** |
| Purchasing | **LOW** | Independent |
| Historical pricing | **LOW** | Independent |
| Recipe | **MED** | Wrong canonical → wrong cost rollup if user accepts without review |

**Mitigation:** Confidence tiers; block bulk submit on LOW; no auto-create; re-run expansion simulation after Phase 3.

---

## Cross-phase cumulative risks

| Risk | When it emerges | Severity |
|------|-----------------|----------|
| Token whack-a-mole | Phase 2 without Phase 3 guardrails | MED |
| Product collapse (Mozzarella family) | Phase 3 over-generalization | HIGH if ungated |
| UX inconsistency | Phase 1 dialog vs bulk sheet not aligned | LOW |
| Test drift | Phase 1 changes alias-guard test expectations | LOW |

---

## Risk ordering rationale

Phases ordered LOW → LOW–MED → MED blast radius. Do not skip Phase 1 to reach Phase 2 faster — EMPTY bucket is largest and lowest-risk fix.
