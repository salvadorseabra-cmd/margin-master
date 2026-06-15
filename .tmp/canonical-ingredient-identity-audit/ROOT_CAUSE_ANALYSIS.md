# Root Cause Analysis

**Audit date:** 2026-06-15  
**Verdict:** **E — Multiple causes** (primarily C + D, with UX guard amplification)

---

## Hypothesis evaluation

| ID | Hypothesis | Verdict | Confidence |
|----|------------|---------|------------|
| A | Prompt quality | **Ruled out** | High |
| B | Model quality | **Ruled out** | High |
| C | Missing normalization layer | **Primary cause** | High |
| D | Missing culinary ontology | **Primary cause** | High |
| E | Multiple causes | **Confirmed** | High |

---

## A. Prompt quality — RULED OUT

Review & Create suggestions are generated entirely by deterministic TypeScript:

- `buildCanonicalIngredientCreateDefaults` → `formatCanonicalIngredientDisplayName` / `generateOperationalIngredientName`
- No OpenAI/Anthropic call in this path
- Invoice OCR uses GPT-4.1 vision, but OCR output is consumed as-is; no "canonical name" prompt exists

**Evidence:** `canonical-ingredient-operational-name.ts:42` — *"deterministic, not LLM"*

---

## B. Model quality — RULED OUT

Same as A. Model quality affects OCR text extraction, not canonical suggestion logic. Reported weak/empty examples have correctly extracted invoice names in VL data (e.g. `"Tomilho"`, `"Manteiga Coimbra s/Sal Emb 1 Kg"`).

---

## C. Missing normalization layer — PRIMARY

The cleanup layer (`cleanCanonicalIngredientNameForCatalog`) is **incomplete for Portuguese foodservice catalog naming**.

### Gaps identified

| Gap | Example | Code location |
|-----|---------|---------------|
| Brand tokens not stripped | Coimbra, MORENO, Hasse, Ibérica, Simonetta | `CATALOG_NOISE_TOKENS` (`canonical-ingredient-display-name.ts:37-56`) |
| Supplier codes not stripped | FSTK, EMB | `OPERATIONAL_ALIASES.emb = "emb"` (no-op) |
| Channel/pack words not stripped | cartão, dúzias, s/sal | Not in noise sets |
| Retail phrases only | Continente, Auchan covered; supplier brands not | `CATALOG_NOISE_PHRASES:24-31` |
| Gram weight over-preserved | 250g on salad | `isOperationalGramToken` always preserves 2-3 digit grams |

### Impact

Weak suggestions retain invoice noise instead of producing clean catalog identities. Measured: **30.3% WEAK** on unmatched VL lines; Bidfood lines almost entirely affected.

---

## D. Missing culinary ontology — PRIMARY

No semantic layer maps invoice product descriptions to canonical culinary identities.

| Invoice | Ideal canonical | Current behavior |
|---------|-----------------|------------------|
| Tomilho | Tomilho | Empty (guard) |
| Ovo MORENO Classe M… | Ovo | Weak (brand+grade retained) |
| Abóbora Butternut | Abóbora | Empty (no variety folding) |
| Pêra Abacate Hasse | Pêra abacate | Empty (brand retained) |
| Manteiga Coimbra s/Sal | Manteiga sem sal | Weak (brand+pack retained) |

The system performs **string cleanup**, not **culinary classification**. Produce, herbs, dairy, and eggs need category-aware rules that the current token-stripping approach cannot provide.

---

## E. Multiple causes — CONFIRMED

### Cause interaction diagram

```
Invoice line (good OCR)
    │
    ├─ Simple produce/herb name
    │     └─ Title-case only → alias guard → EMPTY (UX gap)
    │
    ├─ Branded/packaged product
    │     └─ Incomplete normalization → WEAK suggestion
    │
    └─ Shorthand (ANGUS PTY)
          └─ Operational expansion works well → EXCELLENT/ACCEPTABLE
```

### Additional factor: anti-alias guard

The `confirmedNameMatchesInvoiceAlias` guard is **correct for validation** but **harmful for UX** on simple names. It converts would-be-acceptable names into EMPTY, inflating empty rate to **42.4%** on unmatched scope.

---

## Evidence summary

| Observation | Points to |
|-------------|-----------|
| ANGUS PTY → Angus patty works | Normalization layer works for known shorthand |
| Tomilho → empty | Guard + no ontology for simple produce |
| Manteiga Coimbra → weak | Missing brand/pack token rules |
| 0% usable on Bidfood unmatched | Produce/herb-heavy invoice hits guard + missing ontology |
| 66.7% usable on Bocconcino | Shorthand-heavy invoice benefits from operational path |

---

## Conclusion

Catalog quality problem is **not** upstream data correctness or model/prompt failure. It is a **deterministic canonicalization gap**: incomplete token normalization (C) and absence of culinary semantic mapping (D), amplified by the anti-alias guard on simple produce names.
