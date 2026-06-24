# Invoice Review Operational Cost Label Cleanup

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-24T02:26:38.642Z

---

## Verdict: A) Safe to merge

---

## Goal

Remove redundant "usable" suffix from operational **cost** label only (not quantity label).

| Line | Before | After |
|------|--------|-------|
| Quantity | `250 g usable` | `250 g usable` *(unchanged)* |
| Cost | `€8.76 / kg usable` | `€8.76 / kg` |

---

## Root Cause

`buildNormalizationCard` in `invoice-purchase-price-semantics.ts` rebuilt `usableCostLine` from `effectiveUsableCostLabel` and appended ` usable`:

```ts
usableCostLine = `${costOnly} / ${args.effectiveUnit} usable`;
```

`effectiveUsableCostLabel` already carries the correct unit (e.g. `€8.76 / kg`) — the suffix was presentation-only redundancy.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/invoice-purchase-price-semantics.ts` | `usableCostLine` now uses `effectiveUsableCostLabel` directly (no ` usable` suffix) |
| `src/lib/invoice-purchase-price-semantics.test.ts` | Updated expectations + dedicated cleanup test |

**Not changed:** `src/routes/invoices.tsx`, calculations, persistence, recipe costing, ingredient detail modal.

---

## Validation Matrix

| Case | Product | Pass | Quantity label | Cost label |
|------|---------|:----:|----------------|------------|
| A | Pêra Abacate Hasse | ✓ | *(collapsed)* | *(collapsed)* |
| B | Salada Ibérica | ✓ | 250 g usable | €8.76 / kg |
| C | Ovo classe M | ✓ | 180 un usable | €0.2136 / egg |
| D | Tomilho | ✓ | 100 g usable | €20.60 / kg |
| E | Manjericão | ✓ | 500 g usable | €20.60 / kg |
| — | Angus burger case | ✓ | 7.2 kg usable | €6.39 / kg |
| — | BATATA PALHA 2KG | ✓ | 2 kg usable | €14.50 / kg |

**7/7 matrix rows passed**

---

## Before / After Highlights

| Product | Before (operational) | After |
|---------|---------------------|-------|
| Salada Ibérica | 250 g usable + €8.76/kg **usable** | 250 g usable + €8.76/kg |
| Ovo classe M | 180 un usable + €0.2136/egg **usable** | 180 un usable + €0.2136/egg |
| Tomilho | 100 g usable + €20.60/kg **usable** | 100 g usable + €20.60/kg |
| Manjericão | 500 g usable + €20.60/kg **usable** | 500 g usable + €20.60/kg |
| Pêra Abacate | *(collapsed)* | *(collapsed — unchanged)* |

---

## Blast Radius

- **Scope:** Invoice Review row right column only (`InvoiceNormalizationCardCell` via `card.usableCostLine`)
- **Unchanged:** `effectiveUsableCostLabel` still computed identically; other consumers (API, ingredient memory) unaffected
- **Risk:** Low — one-line presentation formatter change

---

## Tests

```
 ✓ src/lib/invoice-purchase-price-semantics.test.ts (64 tests) 79ms

 Test Files  1 passed (1)
      Tests  64 passed (64)
   Start at  03:26:37
   Duration  849ms (transform 395ms, setup 0ms, collect 473ms, tests 79ms, environment 0ms, prepare 68ms)


```
