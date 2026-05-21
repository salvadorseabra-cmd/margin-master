# ingredient_aliases runtime trace (instrumentation only)

## Enable tracing

In **DEV**, compare-row traces emit automatically for invoice lines whose names include:
`CHK BREADED`, `ANGUS` / `ANG PTY`, or `HMB 180`.

In **production** (or to log every alias op, not only compare rows):

```js
window.__MARGINLY_ALIAS_TRACE__ = true;
// optional: all invoice lines, not only compare names
window.__MARGINLY_ALIAS_TRACE_ALL__ = true;
```

Filter the console by prefix: `[ingredient_aliases_trace]`

## Reproduce CHK BREADED (broken)

1. Open Invoices, expand an invoice with line **CHK BREADED** (unmatched).
2. Open DevTools → Console, filter `[ingredient_aliases_trace]`.
3. Use **Create ingredient** (canonical dialog). Enter a full catalog name (not shorthand), submit.
4. Watch stages from `CanonicalIngredientCreateDialog:submit` → `saveCanonicalIngredientFromInvoice:*` → `persistIngredientCorrectionForItem:*` → `persistManualIngredientCorrection:*` → `upsertConfirmedAlias:*` → `insert-before` / `insert-after` / `insert-error`.

Note `compareBucket: "CHK_BREADED"` on each line.

## Reproduce ANGUS PTY (working)

Repeat on a line **ANG PTY** / **ANGUS** (or confirm-match flow on **HMB 180**).

Note `compareBucket: "ANGUS_PTY"` or `"HMB_180"`.

## Compare paths in console

Side-by-side diff checklist:

| Stage | What to compare |
|-------|-----------------|
| `compareBucket` | `CHK_BREADED` vs `ANGUS_PTY` |
| `validation-rejected` / `normalization-rejected` / `shorthand-rejected` | Which `function` + `branch` fired (CHK only?) |
| `buildManualIngredientCorrectionKeys:ok` | `normalizedAlias`, `operationalAliasKey`, `expandedName` |
| `persistManualIngredientCorrection:upsert-call` | Was upsert reached? |
| `insert-before` | Exact `payload` sent to Supabase |
| `insert-after` | `data`, `error`, `status`, `statusText` |
| `insert-error` | DB/RLS/constraint failure details |
| `early-return` | `branch` + `insertAttempted: false` (insert never tried) |
| `catch` | Swallowed errors (e.g. localStorage) |

Working ANGUS should show `insert-after` with `error: null`. Broken CHK may stop earlier (`early-return`, validation branch) or show `insert-error` with Supabase `code`/`details`.

## Related prefixes (existing, not gated)

- `[canonical-create]` — high-level canonical create flow
- `[ingredient_aliases]` — legacy alias debug (always `console.debug` on success paths)
