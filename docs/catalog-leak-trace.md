# Catalog leak trace (`[catalog_leak]` / `[catalog_leak_detected]`)

Instrumentation only — no behavior changes. Use DevTools console filters in **DEV**.

## Where `[catalog_leak] legacy-pollution-detected` fires

**Not on insert.** It runs when the app **loads** active rows from `public.ingredients` before UI filters:

| Call site | Context string |
|-----------|----------------|
| `loadCanonicalIngredientCatalog` | `loadCanonicalIngredientCatalog:before-filter` |
| `loadMatchingIngredientCatalog` | `loadMatchingIngredientCatalog:before-filter` |

Implementation: `logCatalogLeakDiagnostics` → `detectCatalogLeakRows` in `src/lib/ingredient-catalog-diagnostics.ts`.

A row is flagged when:

1. `ingredient_kind === 'alias'` → `explicit_alias_kind`
2. Name matches invoice/OCR shorthand heuristics (`looksLikeInvoiceShorthandName`) and kind is `canonical` → `legacy_canonical_shorthand` (e.g. **CHK BREADED**, **ANGUS PTY**, **BATATA** lines)
3. Same shorthand without explicit canonical kind → `invoice_shorthand_name`

Filtered rows still exist in the DB; the log means **legacy pollution is present**, not that the current session just inserted them.

Companion structured log: `[catalog_leak_detected] legacy-pollution-detected` (same payload + `flowFunction: logCatalogLeakDiagnostics`).

## All `public.ingredients` insert paths (current code)

| # | Location | `flowOrigin` | `ingredients.name` source |
|---|----------|--------------|---------------------------|
| 1 | `persistIngredientFromInvoiceItem` (`ingredient-auto-persist.ts`) | `explicit_user` only (others blocked) | User-confirmed canonical from `buildExplicitCanonicalInsertPayload` (`buildCatalogIngredientIdentity`) |
| 2 | `IngredientsPage.saveNewIngredient` (`ingredients.tsx`) | `manual_form` | Form field → `formatCanonicalIngredientDisplayName` |

**No insert today:**

- `autoPersistUnmatchedInvoiceItems` — alias memory + skips only (`auto_persist`, `insertAttempted: false`)
- `confirmIngredientMatch` / `selectIngredientForItem` — `ingredient_aliases` only (`rematch`)
- `ingredient-correction-memory` — aliases only

**Historical leak vector (pre-guard):** `buildIngredientInsertPayload` sets `name` and `normalized_name` directly from **invoice line text** (`item.name`). Auto-insert is disabled, but this helper still runs for defaults; grep `[canonical_create_source] invoice-line-as-name`.

## Structured log prefixes

| Prefix | When |
|--------|------|
| `[canonical_create_attempt]` | Any path that might insert or builds/skips an insert payload |
| `[canonical_create_source]` | How `ingredients.name` would be chosen (`nameSource`: `invoice_line` \| `user_canonical` \| `form_input`) |
| `[catalog_leak_detected]` | Pollution detected on catalog load (pairs with `[catalog_leak]`) |

Each attempt log includes: `flowFunction`, `flowOrigin`, `rawInvoiceText`, `normalized`, `finalCanonicalName`, `insertAttempted`, `blocked`, `blockReason`.

`flowOrigin` enum: `explicit_user` \| `auto_persist` \| `rematch` \| `manual_form` \| `unknown`.

## Reproduce in browser

1. `npm run dev`, open app, DevTools → Console.
2. Filter `[catalog_leak]` or `[catalog_leak_detected]`.
3. Open **Ingredients** or **Invoices** (expands catalog load). If DB has shorthand canonical rows (CHK BREADED, ANGUS PTY, etc.), warnings appear with `context` and `samples`.
4. Filter `[canonical_create_attempt]`:
   - Expand invoice → auto-persist runs → `autoPersistUnmatchedInvoiceItems` skip logs for unmatched lines.
   - **Create ingredient** on a line → `saveCanonicalIngredientFromInvoice` → `buildExplicitCanonicalInsertPayload` → `persistIngredientFromInvoiceItem` insert-attempt (if not blocked).
5. Filter `[canonical_create_source]` → see `invoice-line-as-name` when payload builder uses OCR/invoice text as proposed name.

## Related docs

- `docs/ingredient-alias-trace-repro.md` — `[ingredient_aliases_trace]` for alias insert failures
