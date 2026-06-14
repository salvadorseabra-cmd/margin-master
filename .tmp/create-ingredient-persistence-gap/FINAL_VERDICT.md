# Final Verdict — Create Ingredient Persistence Gap (Anchoas)

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Queried live VL DB:** 2026-06-14T17:34Z  
**Verdict tag:** `NORMALIZATION_MISMATCH`  
**Classification:** Not a Create-flow persistence bug — exact-key recall under OCR variance

---

## Direct Answers (Q1–Q5)

### Q1. Does Create Ingredient persist an alias?

**Yes.**

`saveCanonicalIngredientFromInvoiceRow` always calls `deps.persistIngredientCorrection` (wired to `persistIngredientCorrectionForItem`) after ingredient insert/reuse. Live DB proof: first Anchoas alias row written **160ms** after ingredient creation (`2026-06-07T23:42:41.333Z` vs `2026-06-07T23:42:41.173Z`).

Evidence:

- Code: `src/lib/bulk-canonical-ingredient-create.ts:281`
- DB: alias `94cd3a7c…` — `Filete de Anchoas Alfonsoita L4 495 g` / Avijudo

---

### Q2. Same records as Match Existing Ingredient?

**Yes — identical persist chain.**

Both paths converge on:

```
persistIngredientCorrectionForItem
  → persistManualIngredientCorrection
       → applyManualIngredientCorrection (alias map + operational + override)
       → upsertConfirmedAlias → ingredient_aliases
       → persistOperationalIngredientCostFromInvoiceLine
       → localStorage alias map
  → dualWriteMatchLifecycleAfterIngredientPersist → invoice_item_matches
```

Only UX differs (toast, dialog, MLS reassign on prior match). No persistence layer divergence.

See `SIDE_BY_SIDE_COMPARISON.md`.

---

### Q3. Does original Anchoas invoice line have alias record today?

**Yes — for the line that actually created Anchoas.**

| Field | Value |
|-------|-------|
| Create OCR | `Filete de Anchoas Alfonsoita L4 495 g` |
| Supplier | Avijudo (May review) |
| Normalized key | `filete de anchoas alfonsoita 495` |
| Alias row | Yes — co-created 2026-06-07 (+160ms) |

**Clarification:** The "original line" in the paradox framing often assumed April AVILUDO (`c2f52357…`). That line did **not** create Anchoas. Anchoas was born on Avijudo May. April has separate aliases added later (Alconfrisa, Alconfi sta, Alconfrista, etc.).

---

### Q4. If not, why not?

**N/A for the create line — alias exists.**

April re-read fails when **re-read OCR ≠ any stored alias key** for that supplier. Example: post-hardening stable spelling `Alconfirosa` has no alias row → unmatched. Manual match on `Alconfrista` succeeds on next re-read **only when OCR returns `Alconfrista`**.

This is recall failure (exact-key model), not missing create-time write.

---

### Q5. Root cause: CREATE_FLOW_GAP | ALIAS_MISSING | NORMALIZATION_MISMATCH | OTHER

**Primary: `NORMALIZATION_MISMATCH`**

| Option | Verdict |
|--------|---------|
| `CREATE_FLOW_GAP` | **NO** — code and DB prove alias persist on create |
| `ALIAS_MISSING` | **Partial** — missing for *current re-read spelling*, not create-time spelling |
| `NORMALIZATION_MISMATCH` | **YES — PRIMARY** |
| `OTHER` | OCR non-determinism / no preserve policy (contributing, out of scope) |

---

## Summary Table

| # | Question | Answer |
|---|----------|--------|
| Q1 | Create persists alias? | **Yes** |
| Q2 | Same as Match Existing? | **Yes — identical chain** |
| Q3 | Original line has alias? | **Yes** (Alfonsoita / Avijudo) |
| Q4 | If not, why? | N/A — April fails on OCR key mismatch |
| Q5 | Root cause | **`NORMALIZATION_MISMATCH`** |

---

## Evidence Summary

| Claim | Evidence |
|-------|----------|
| Create persists alias | `bulk-canonical-ingredient-create.ts:281`; DB +160ms co-creation |
| Same as Match | Both → `persistIngredientCorrectionForItem` → `persistManualIngredientCorrection` |
| Original line has alias | `94cd3a7c…` Alfonsoita / Avijudo / 2026-06-07 |
| Re-read failure | Matcher: `Alconfirosa` → unmatched; `Alconfrista` → confirmed-override |
| Not a save bug | 10 aliases in DB; 2026-06-14 manual-match rows work on matching OCR |

---

## Deliverables

| File | Contents |
|------|----------|
| `CREATE_FLOW.md` | Create Ingredient persistence chain |
| `MATCH_FLOW.md` | Match Existing Ingredient persistence chain |
| `SIDE_BY_SIDE_COMPARISON.md` | Layer-by-layer comparison |
| `ANCHOAS_ALIAS_AUDIT.md` | Live DB alias audit |
| `ROOT_CAUSE.md` | Paradox explanation + classification |
| `FINAL_VERDICT.md` | This file (Q1–Q5) |

Optional validation script:

```bash
npx vite-node scripts/validate-create-ingredient-persistence.mts [baseline|matcher|compare|all]
```

---

## Out of Scope (Per Brief)

- OCR pipeline fixes
- Match lifecycle redesign
- Pricing / cost sync behavior
- Fuzzy alias or brand-token normalization proposals
