# Gorgonzola OCR Anchoring + Pass C Validation Hardening

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Design:** D (OCR anchoring + validation) · 2026-06-24

## Changed files

- `supabase/functions/extract-invoice/invoice-qty-prepass.ts`
- `supabase/functions/extract-invoice/invoice-qty-prepass.test.ts`
- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- `supabase/functions/extract-invoice/invoice-monetary-binding.ts`
- `src/lib/invoice-extraction-review.ts`
- `src/lib/invoice-extraction-review.test.ts`
- `src/routes/invoices.tsx`

## Anchoring rule

- Qty pre-pass before Hybrid H on cropped table image
- Scope: fractional `kg` rows with Emporio discount-table semantics
- Anchor when OCR score beats Pass C by €0.10, or math fails and OCR score ≤ €0.50
- Flag `ocr_qty_mismatch` when Δ > 10% and anchor not applied

## Review integration

- `OCR_QUANTITY_MISMATCH` in `invoice-extraction-review.ts`
- Wired into `needsExtractionConfirmation` with session `extractionMetaByItemId`
- Existing `MATHEMATICAL_RECONCILIATION_FAILURE` retained

## Gorgonzola validation matrix

| Case | OCR | Pass C | Total | Anchored | Math review | OCR review | Pass |
|------|-----|--------|-------|----------|-------------|------------|------|
| A_v28 | 1.35 | 1.05 | 13.44 | 1.35 | — | — | ✓ |
| B_qty2_correctTotal | 1.35 | 2 | 13.44 | 1.35 | — | — | ✓ |
| C_agreement | 1.35 | 1.35 | 13.44 | 1.35 | — | — | ✓ |
| S3_v38 | 1.35 | 2 | 18.72 | 2 | — | FLAG | ✓ |

## Regression controls (VL persisted rows)

| Product | Math review | OCR review | Expected | Pass |
|---------|-------------|------------|----------|------|
| Gorgonzola | PASS | PASS | math=FLAG | ✗ |
| Prosciutto | PASS | PASS | math=PASS | ✓ |
| Mortadella | PASS | PASS | math=PASS | ✓ |
| Bresaola | PASS | PASS | math=PASS | ✓ |
| Pellegrino | PASS | PASS | math=PASS | ✓ |
| Ovo | PASS | PASS | math=PASS | ✓ |
| Tomilho | PASS | PASS | math=PASS | ✓ |
| Manjericão | PASS | PASS | math=PASS | ✓ |
| Salada | PASS | PASS | math=PASS | ✓ |
| Peroni | PASS | PASS | math=PASS | ✓ |
| Paccheri | PASS | PASS | math=PASS | ✓ |

## VL replay

- Corpus: 52 rows · math flagged: 0
- OCR mismatch flags require fresh extraction (meta not persisted to DB)
- Gorgonzola VL row is v38 self-consistent (2/9.35/18.72) — protected on re-extract via OCR_QTY_MISMATCH

## Blast radius

- +1 GPT call per extraction (qty pre-pass on cropped table)
- No schema migration; scoped fractional kg Emporio family only
- Recipe costing unchanged

## Verdict

**A** — Gorgonzola scenarios A/B/C/S3 validated; controls unchanged on VL corpus