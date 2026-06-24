# Embedded-measure call-site fix validation

**Generated:** 2026-06-23T10:39:40.735Z  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Items replayed:** 52

## Verdict: **Safe to merge**

## Root cause fixed

Persistence call site in `invoices.tsx` now passes `quantity` into `resolveInvoiceItemUnit` / `resolveInvoicePersistedItemUnit`. The gated `shouldInferUnForEmbeddedMeasureCountable` requires integer quantity > 1; without quantity the resolver returned `null` even when resolver logic was deployed.

## Before / after — focus products

| Product | DB qty | OCR unit | Before (no qty) | After (with qty) | DB unit |
|---------|--------|----------|-----------------|------------------|---------|
| Paccheri 500g | 24 | null | **null** | **un** | null |
| Ginger Beer 0.20cl | 24 | null | **null** | **un** | null |

## Regression controls (unchanged insert unit)

- **Peroni 33cl×24**: before=un, after=un ✓
- **Pellegrino 75cl×15**: before=un, after=un ✓
- **Açúcar 10x1kg**: before=cx, after=cx ✓
- **Pomodori 2.5kg×6**: before=un, after=un ✓
- **Mozzarella 125g×8**: before=un, after=un ✓
- **Guanciale**: before=un, after=un ✓

## Blast radius

Rows whose insert unit changes with this fix: **2** (expected: 2 — Paccheri + Ginger only).

- De Cecco - Paccheri Lisci Nr. 125 - 500g: null → un
- Baladin - Ginger Beer 0.20cl: null → un

## Tests

- `src/lib/invoice-purchase-format.test.ts` — resolver gate (unchanged)
- `src/lib/invoice-persistence-unit-call-site.test.ts` — persistence call-shape regression (new)

## Checks

| Check | Pass |
|-------|------|
| Paccheri 500g → un | ✓ |
| Ginger Beer 0.20cl → un | ✓ |
| No regression on controls | ✓ |
| Blast radius = 2 rows only | ✓ |
