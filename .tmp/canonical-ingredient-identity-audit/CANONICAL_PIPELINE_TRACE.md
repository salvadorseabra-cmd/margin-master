# Canonical Pipeline Trace

**Audit date:** 2026-06-15  
**Scope:** Review & Create canonical suggestion path (invoice line → UI preview)  
**Method:** Static code trace + live execution via `buildCanonicalIngredientCreateDefaults`

---

## End-to-end flow

```
Invoice PDF/image
  └─ supabase/functions/extract-invoice/index.ts
       └─ extractTableItemsFromImage (Pass C, GPT-4.1 vision)
       └─ finalizeExtractedLineItems
            └─ invoice_items.name persisted (raw OCR text)

Invoice table row (UI)
  └─ normalizeInvoiceItemFields (src/lib/invoice-item-fields.ts)

Matching (parallel concern — does NOT produce suggestions)
  └─ collectUnmatchedRowsForBulkCreate
       └─ resolveInvoiceTableRowIngredientMatch
            └─ findInvoiceItemIngredientMatch
                 └─ normalizeSupplierShorthand
                 └─ findCanonicalIngredientMatch (src/lib/ingredient-canonical.ts)

Review & Create suggestion (THIS audit's focus)
  └─ buildCanonicalIngredientCreateDefaults (src/lib/canonical-ingredient-create.ts:146-215)
       ├─ looksLikeInvoiceShorthandName (src/lib/ingredient-kind.ts)
       ├─ looksLikeSupplierAbbreviatedCatalogName (src/lib/canonical-ingredient-operational-name.ts)
       ├─ generateOperationalIngredientName → expandSupplierAbbreviations → formatCanonicalIngredientDisplayName
       ├─ OR formatCanonicalIngredientDisplayName (display-only path)
       └─ confirmedNameMatchesInvoiceAlias guard → null if normalized suggestion ≡ invoice

UI display
  └─ BulkCanonicalIngredientCreateSheet / CanonicalIngredientCreateDialog (src/routes/invoices.tsx)
       └─ suggestedCanonicalName shown as preview only; confirmed name field left empty
```

---

## Functions that generate canonical suggestions

| Function | File | Role |
|----------|------|------|
| **`buildCanonicalIngredientCreateDefaults`** | `src/lib/canonical-ingredient-create.ts:146` | **Primary entry point** for Review & Create suggestions |
| `generateOperationalIngredientName` | `src/lib/canonical-ingredient-operational-name.ts:112` | Shorthand/abbreviated invoice lines |
| `expandSupplierAbbreviations` | `src/lib/canonical-ingredient-operational-name.ts:45` | Token expansion via `OPERATIONAL_ALIASES` |
| `normalizeSupplierShorthand` | `src/lib/ingredient-operational-aliases.ts` | Dictionary + supplier memory expansion |
| `formatCanonicalIngredientDisplayName` | `src/lib/canonical-ingredient-display-name.ts:338` | Title-case display label |
| `cleanCanonicalIngredientNameForCatalog` | `src/lib/canonical-ingredient-display-name.ts:224` | Strip pack/supplier noise tokens |
| `confirmedNameMatchesInvoiceAlias` | `src/lib/canonical-ingredient-create.ts:73` | Suppresses suggestion when cleanup ≡ invoice |

### Separate path (existing catalog rename — NOT Review & Create)

| Function | File | Role |
|----------|------|------|
| `generateCanonicalNamingSuggestion` | `src/lib/canonical-ingredient-quality.ts:300` | Suggests renames for polluted existing catalog entries |
| Used by | `src/components/canonical-ingredient-suggestions-section.tsx` | Ingredients admin quality queue |

---

## Services / models involved

| Stage | Technology | Notes |
|-------|------------|-------|
| Invoice extraction | **GPT-4.1 vision** (Pass C) | Produces raw `item.name`; no canonical logic here |
| Normalization | **Deterministic TypeScript** | `normalizeIngredientName`, supplier token expansion |
| Matching | **Deterministic TypeScript** | Fuzzy/canonical match; independent of suggestion |
| **Canonical suggestion** | **Deterministic TypeScript — no LLM** | Rule-based cleanup + title case |
| UI | React (`invoices.tsx`) | Preview field only; user must confirm name |

**Critical finding:** Review & Create canonical suggestions are **100% deterministic**. There is no prompt, no model call, and no confidence threshold in the suggestion path.

---

## Where the suggested canonical originates

```146:179:src/lib/canonical-ingredient-create.ts
export function buildCanonicalIngredientCreateDefaults(
  item: AutoPersistInvoiceItem,
  options?: {
    supplierName?: string | null;
    isGenericUnit?: (unit: string | null | undefined) => boolean;
  },
): CanonicalIngredientCreateFormDefaults {
  // ...
  const operationalName = generateOperationalIngredientName(invoiceAlias) || null;
  const useOperationalSuggestion =
    looksLikeInvoiceShorthandName(invoiceAlias) ||
    looksLikeSupplierAbbreviatedCatalogName(invoiceAlias);
  let suggestedCanonicalName = useOperationalSuggestion
    ? operationalName
    : formatCanonicalIngredientDisplayName(invoiceAlias) || null;
  if (
    suggestedCanonicalName &&
    confirmedNameMatchesInvoiceAlias(suggestedCanonicalName, invoiceAlias)
  ) {
    suggestedCanonicalName = null;
  }
```

**Decision tree:**

1. If invoice looks like **shorthand** (`ANGUS PTY`) or **supplier-abbreviated catalog** (`Ovo MORENO Classe M…`) → operational expansion path.
2. Otherwise → display cleanup path (`formatCanonicalIngredientDisplayName`).
3. If normalized result equals invoice alias → **`null`** (empty UI).

The suggestion is a **preview only** (`suggestedCanonicalName`). The confirmed name field is intentionally left empty for user input (`canonical-ingredient-create.ts:135-136`).

---

## Bulk create orchestration

```94:132:src/lib/bulk-canonical-ingredient-create.ts
export function collectUnmatchedRowsForBulkCreate(params: { ... }): BulkCanonicalCreateCandidate[] {
  // filters eligible unmatched rows
  // calls buildCanonicalIngredientCreateDefaults per row
}
```

Persist path on submit: `saveCanonicalIngredientFromInvoiceRow` → `validateCanonicalIngredientName` → `buildExplicitCanonicalInsertPayload` → `buildCatalogIngredientIdentity`.

---

## Evidence: no LLM in suggestion path

- `generateOperationalIngredientName` docstring: *"Expand supplier invoice tokens to operational words (deterministic, not LLM)."* (`canonical-ingredient-operational-name.ts:42`)
- `cleanCanonicalIngredientNameForCatalog` docstring: *"Does not touch invoice aliases, matcher keys, or OCR text."* (`canonical-ingredient-display-name.ts:219-223`)
- Tests in `canonical-ingredient-create.test.ts` cover shorthand, alias-equality guard, and operational expansion with zero network/model dependencies.
