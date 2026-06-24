# Mathematical Reconciliation Needs Review Guardrail

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Corpus:** 52 invoice_items · 2026-06-24

## Implementation

- **Helper:** `src/lib/invoice-extraction-review.ts`
- **Integration:** `needsExtractionConfirmation` in `src/routes/invoices.tsx`
- **Reason:** `MATHEMATICAL_RECONCILIATION_FAILURE`
- **Message:** Quantity × Unit Price does not reconcile with Line Total
- **Flag when:** variance_abs > €0.50 **AND** variance_pct > 5%
- **Scope:** Review detection only — no persistence, extraction, matching, recipe, or operational changes

## Unit tests (A–D)

| Case | Input | Expected | Result |
|------|-------|----------|--------|
| A | 1.05×10.88 vs 13.44 | FLAG | PASS |
| B | 1.35×9.95 vs 13.44 | PASS | PASS |
| C | 10×8.12 vs 81.23 (rounding) | PASS | PASS |
| D | 1×15.55 vs 16.09 (discount) | PASS | PASS |

## VL spotlight replay

| Product | Variance % | Review Flag | Reason | Expected | Pass |
|---------|------------|-------------|--------|----------|------|
| Gorgonzola | 15.03% | FLAG | MATHEMATICAL_RECONCILIATION_FAILURE | FLAG | ✓ |
| Prosciutto | 0.03% | PASS | — | PASS | ✓ |
| Mortadella | 0% | PASS | — | PASS | ✓ |
| Bresaola | 0% | PASS | — | PASS | ✓ |
| Aceto | 3.36% | PASS | — | PASS | ✓ |
| Pellegrino | 0.31% | PASS | — | PASS | ✓ |
| Tomilho | 0% | PASS | — | PASS | ✓ |
| Ovo | 0% | PASS | — | PASS | ✓ |
| Salada | 0% | PASS | — | PASS | ✓ |

**Corpus flagged:** 1 / 52

## Scope confirmation

- persistence: unchanged
- extraction: unchanged
- matching: unchanged
- recipeCosting: unchanged
- operationalCalculations: unchanged
- history: unchanged
- schemaMigrations: none

## Verdict

**A** — Gorgonzola flagged; control products pass; detection-only scope preserved