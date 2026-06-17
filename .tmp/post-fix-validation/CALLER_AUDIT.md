# Caller Audit — Post line_total Wiring

**Date:** 2026-06-16  
**Mode:** Read-only validation

---

## `operationalCostFieldsFromInvoiceLine`

| Caller | File | Passes `total`? | Can persist `ingredient_price_history`? | Double-divide risk? |
|--------|------|-----------------|----------------------------------------|---------------------|
| Internal wrapper | `ingredient-auto-persist.ts:71–83` | Maps `item.total` → `line_total` | N/A | No when `total` present |
| `persistOperationalIngredientCostFromInvoiceLine` | `ingredient-auto-persist.ts:113` | Via `item` | **Yes** (via caller) | No when caller passes `total` |
| `buildIngredientInsertPayload` | `ingredient-auto-persist.ts:407` | Only if `item` has `total` | **No** (ingredient create only) | Yes for multi-`un` without `total` — not a history path |
| Overlay scan | `ingredient-operational-intelligence.ts:878–884` | **Yes** (`normalized.total`) | **No** (display overlay) | No |
| Backfill | `ingredient-price-history-backfill.ts:177` | **Yes** (`row.normalized.total` from DB) | **Yes** | No |
| Tests (~30 sites) | various `*.test.ts` | Mixed (scenario-specific) | Mock only | N/A |

---

## `persistOperationalIngredientCostFromInvoiceLine`

| Caller | File | Passes `total`? | History? | Double-divide? |
|--------|------|-----------------|----------|----------------|
| `syncOperationalIngredientCostsFromInvoiceLines` | `ingredient-operational-intelligence.ts:998–1007` | **Yes** | **Yes** | No |
| `persistIngredientCorrectionForItem` | `invoices.tsx:1948–1957` | **Yes** | **Yes** | No |
| Tests | `ingredient-price-history-persistence.test.ts` | **Yes** (Atum/Gema cases) | Mock | No |

---

## `syncOperationalIngredientCostsFromInvoiceLines`

| Caller | File | Passes `total`? | History? | Double-divide? |
|--------|------|-----------------|----------|----------------|
| `runExtraction` (post-OCR) | `invoices.tsx:1486–1497` | **Yes** (`it.total ?? null`) | **Yes** | No |
| Extract-gate tests | `ingredient-operational-intelligence-extract-gate.test.ts` | **Yes** (confirmed-alias cases) | Mock | No |

---

## Summary

All **3 production paths that write `ingredient_price_history`** now pass `total`.

The only production caller of `operationalCostFieldsFromInvoiceLine` without guaranteed `total` is `buildIngredientInsertPayload` (ingredient creation, not history).

**Regression proof (Atum):**

| Input | purchase_qty | history_price |
|-------|-------------|---------------|
| Without `total` | 2 | 3.145 ❌ |
| With `total` | 1 | 6.29 ✅ |

**Missing history-persist callers:** **0**
