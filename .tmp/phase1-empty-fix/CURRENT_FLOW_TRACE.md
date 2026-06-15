# Current Flow Trace — Phase 1

**Date:** 2026-06-15

---

## Entry point: `buildCanonicalIngredientCreateDefaults`

**File:** `src/lib/canonical-ingredient-create.ts`

### Before Phase 1

```
invoiceAlias
 → operational OR display cleanup → suggestedCanonicalName
 → if suggested ≡ invoice (normalized) → suggestedCanonicalName = null
 → UI: empty suggestion, empty confirmed field
```

### After Phase 1

```
invoiceAlias
 → operational OR display cleanup → suggestedCanonicalName
 → catalogReady = isCatalogReadyInvoiceName(invoiceAlias)
 → if suggested ≡ invoice AND NOT catalogReady → null suggestion
 → return { suggestedCanonicalName, catalogReady, ... }
```

---

## Suppression path (pre-Phase 1)

`confirmedNameMatchesInvoiceAlias` at lines 76–84:

- Folds both strings via `normalizeIngredientName`
- Returns true when identical
- Used to null suggestion at lines 200–206 (now guarded by `!catalogReady`)

**Tomilho example:** `formatCanonicalIngredientDisplayName("Tomilho")` → `"Tomilho"` → fold `"tomilho"` ≡ fold `"Tomilho"` → **null**

---

## `isCatalogReadyInvoiceName` (new)

**Criteria (all must pass):**

1. Not invoice shorthand (`looksLikeInvoiceShorthandName`)
2. Not supplier-abbreviated catalog name
3. Not blocked on create (`shouldBlockCanonicalNameOnCreate`)
4. Display cleanup ≡ invoice alias (title-case only change)
5. ≤2 tokens (`CATALOG_READY_MAX_TOKENS`)
6. No digits in alias (excludes pack weights, SKUs)

**Excludes:** `Pêra Abacate Hasse` (3 tokens), `Salada Ibérica FSTK EMB. 250g` (digits + many tokens), shorthand lines.

---

## `validateCanonicalIngredientName`

**Before:** Blocked any confirmed name ≡ invoice alias.

**After:** Allows ≡ alias **when** `isCatalogReadyInvoiceName(invoiceAlias)` is true.

Shorthand lines (`ANGUS PTY`, `Óleo girassol fula 1L`) still blocked.

---

## UI: `CanonicalIngredientCreateDialog`

**File:** `src/components/canonical-ingredient-create-dialog.tsx`

| Field | Before | After |
|-------|--------|-------|
| Suggestion | null for Tomilho | `"Tomilho"` + **Catalog Ready** badge |
| Confirmed prefill | `""` | `suggestedCanonicalName` when `catalogReady` |
| Apply button | Shown | Hidden when `catalogReady` (already pre-filled) |

---

## UI: `BulkCanonicalIngredientCreateSheet`

**File:** `src/components/bulk-canonical-ingredient-create-sheet.tsx`

- Pre-fills `canonicalName` from suggestion (existing behavior)
- Adds **Catalog Ready** badge when `defaults.catalogReady`
- Herbs now have non-null suggestions → bulk sheet pre-fills correctly

---

## Data flow diagram

```
buildCanonicalIngredientCreateDefaults(item)
        │
        ├─ suggestedCanonicalName (never null for catalog-ready herbs)
        ├─ catalogReady: boolean
        │
        ▼
CanonicalIngredientCreateDialog / BulkSheet
        │
        ├─ prefill confirmed when catalogReady
        ├─ badge "Catalog Ready"
        │
        ▼
validateCanonicalIngredientName(name, { invoiceAlias })
        │
        ├─ catalog-ready + ≡ alias → ok: true
        ├─ non-catalog-ready + ≡ alias → blocked
        │
        ▼
buildExplicitCanonicalInsertPayload → persist
```
