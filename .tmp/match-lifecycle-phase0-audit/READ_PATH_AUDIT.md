# Match Lifecycle Phase 0 — Read Path Audit

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Summary

**Production read paths using `invoice_item_matches`: 0**

All invoice matching continues via virtual resolution (`resolveInvoiceTableRowIngredientMatch` → `invoice-ingredient-match-propagation`).

---

## Grep Results by Location

| Location | Symbol / pattern | Category |
|----------|------------------|----------|
| `supabase/migrations/20260614120000_invoice_item_matches.sql` | `invoice_item_matches` (DDL, indexes, RLS, trigger) | **Migration (Phase 0)** — not a runtime read path |
| `src/lib/invoice-item-match-repository.ts:32,50` | `.from("invoice_item_matches").select(...)` | **Dead code** — no production importer |
| `src/lib/invoice-item-match-repository.test.ts` | mock `.from("invoice_item_matches")` | **Test** |
| `src/lib/invoice-item-match-repository.ts:19` | `LOG_PREFIX = "[invoice_item_matches]"` | **Dead code** — logging constant only |
| `.tmp/match-lifecycle-*` planning docs | design references | **Planning docs** — not executable |
| `src/routes/invoices.tsx` | — | **No hits** |
| `src/lib/ingredient-operational-intelligence.ts` | — | **No hits** |
| `src/lib/invoice-ingredient-match-propagation.ts` | — | **No hits** |
| `src/routes/ingredients.review.tsx` | — | **No hits** |
| `src/lib/catalog-review-current-matches.ts` | — | **No hits** |
| `src/lib/operational-intelligence-view.ts` | — | **No hits** |
| `src/integrations/supabase/types.ts` | — | **No hits** |
| `scripts/*.mts` | — | **No hits** |

---

## Import Graph (Phase 0 Modules Only)

```
invoice-item-match-types.ts
 ↑ imported by: invoice-item-match-helpers.ts, invoice-item-match-repository.ts,
                invoice-item-match-repository.test.ts

invoice-item-match-helpers.ts
 ↑ imported by: invoice-item-match-repository.ts, invoice-item-match-helpers.test.ts

invoice-item-match-repository.ts
 ↑ imported by: invoice-item-match-repository.test.ts ONLY
```

No production file imports any Phase 0 module.

---

## Current Production Read Path (Unchanged)

```typescript
// src/lib/invoice-ingredient-row-display.ts
export function resolveInvoiceTableRowIngredientMatch(
  itemName: string,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  trace?: Parameters<typeof resolveInvoiceRowIngredientMatch>[4],
): {
  match: ReturnType<typeof resolveInvoiceRowIngredientMatch>["match"];
  state: InvoiceRowIngredientMatchState;
} {
  return resolveInvoiceRowIngredientMatch(
    itemName,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
    trace,
  );
}
```

Consumers: `invoices.tsx`, `ingredient-operational-intelligence.ts:658`, `catalog-review-current-matches.ts`, VL scripts.

---

## Q1 — Referenced in Key Areas?

| Area | Referenced? |
|------|:-----------:|
| `invoices.tsx` | **No** |
| `ingredient-operational-intelligence.ts` | **No** |
| Ingredient matching pipeline | **No** |
| Review UI | **No** |
| Operational intelligence | **No** |
| Supplier intelligence | **No** |

---

## Q2 — Existing Read Paths Using Table?

**No.** Repository read functions exist only in `invoice-item-match-repository.ts` and are called **only from tests**.
