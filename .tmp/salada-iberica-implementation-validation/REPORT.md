# Salada Ibérica Operational Representation — Implementation Validation

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Option:** B — Narrow case shortcut to wholesale case units (`cx`/`caixa`/`case`)  
**Generated:** 2026-06-24T00:21:14.493Z

---

## Verdict: A) Safe to merge

---

## Changed Files

| File | Change |
|------|--------|
| `src/lib/invoice-purchase-format.ts` | Added `shouldApplyCasePieceWeightOperationalShortcut`; gated `adjustCasePieceWeightDisplay` |
| `src/lib/invoice-purchase-price-semantics.ts` | Gated `computeEffectiveUsableCost` and `resolvePriceSuffix` |
| `src/lib/invoice-purchase-format.test.ts` | Gate helper + Salada em detector tests |
| `src/lib/invoice-purchase-price-semantics.test.ts` | Salada €8.76/kg regression test |

---

## Salada Ibérica Before / After

| Field | Before | After |
|-------|--------|-------|
| Procurement | €2.19 / pack | **€2.19 / pack** |
| Operational | €2.19 / case | **€8.76 / kg** |
| Usable stock label | null (suppressed) | **250 g usable** |
| `shouldApplyCasePieceWeightOperationalShortcut` | true (would have) | **false** |
| Recipe fields | unchanged | `{"current_price":2.19,"purchase_quantity":250,"cost_base_unit":"g"}` |

---

## Regression Matrix

| Product | Must | Procurement | Operational | Pass |
|---------|:----:|-------------|-------------|:----:|
| Salada Ibérica | FIX | €2.19 / pack | €8.76 / kg | ✓ |
| Manteiga EMB 1kg | — | €8.90 / kg | €8.90 / kg | ✓ |
| Ovo classe M | — | €38.44 / case | null | ✓ |
| Tomilho | — | €2.06 / bunch | null | ✓ |
| Manjericão | — | €2.06 / bunch | €20.60 / kg | ✓ |
| Pellegrino | — | €19.28 / case | €1.71 / L | ✓ |
| Peroni | — | €1.07 / bottle | €3.24 / L | ✓ |
| Mozzarella | — | €20.03 / bag | €6.68 / kg | ✓ |
| Guanciale | — | €89.50 / unit | €8.52 / kg | ✓ |
| Ginger Beer | — | €9.69 / unit | €48.45 / L | ✓ |
| Angus 180G cx | — | €24.90 / case | €24.90 / case | ✓ |

**11/11 passed**

---

## Blast Radius

- **Display-only:** `resolveInvoiceLinePricingPresentation`, `resolveStructuredPurchaseForDisplay`, ingredient detail operational cost label
- **Unchanged:** `recipeOperationalCostFieldsFromInvoiceLine`, persistence, stock-normalization, extraction
- **Angus cx:** `shouldApplyCasePieceWeightOperationalShortcut` remains true → €/case operational preserved

---

## Open Issues

- Unknown em/pack rows with per-piece bare_measure in opaque multi-packs may gain €/kg display (aligns with weight-family recipe model)
- Ginger Beer cx row masking remains out of scope

---

## Test Results

Unit tests: `invoice-purchase-price-semantics.test.ts` (60/60 pass including Salada + Angus), `invoice-purchase-format.test.ts` (new gate tests pass; 2 pre-existing 33cl display failures unrelated).
