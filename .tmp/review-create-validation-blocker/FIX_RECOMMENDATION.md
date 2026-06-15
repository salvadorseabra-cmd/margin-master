# Fix Recommendation — Smallest Safe Change

## Recommended fix (one function)

**File:** `src/lib/canonical-ingredient-operational-name.ts`  
**Function:** `looksLikeSupplierAbbreviatedCatalogName`

Gate the `.toUpperCase()` shorthand re-check behind the same shouty-text threshold used elsewhere:

```ts
// Only re-check uppercased form when input already looks like invoice shouting.
const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
const upperRatio = letters.length > 0
  ? (trimmed.match(/[A-Z]/g) ?? []).length / letters.length
  : 0;

if (looksLikeInvoiceShorthandName(trimmed)) return true;
if (upperRatio >= 0.82 && looksLikeInvoiceShorthandName(trimmed.toUpperCase())) return true;
```

**Why this is safe:**

- `"ANGUS PTY"`, `"BAT shoestr"` — high upperRatio → still blocked
- `"Pêra abacate"`, `"Ovo classe M"` — low upperRatio → `.toUpperCase()` check skipped → allowed
- Fixes both `validateCanonicalIngredientName` AND `persistIngredientFromInvoiceItem` in one place

## Tests to add

In `canonical-ingredient-create.test.ts`:

```ts
it("allows Phase 2 cleaned suggestions on validate + insert", () => {
  expect(validateCanonicalIngredientName("Pêra abacate", {
    invoiceAlias: "Pêra Abacate Hasse",
  })).toEqual({ ok: true });
  expect(validateCanonicalIngredientName("Ovo classe M", {
    invoiceAlias: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
  })).toEqual({ ok: true });
});
```

In `canonical-ingredient-operational-name.test.ts`:

```ts
it("does not block title-cased cleaned catalog names", () => {
  expect(shouldBlockCanonicalNameOnCreate("Pêra abacate")).toBe(false);
  expect(shouldBlockCanonicalNameOnCreate("Ovo classe M")).toBe(false);
});
```

## What NOT to change

- Do **not** remove `shouldBlockCanonicalNameOnCreate` from validation — real shorthand must stay blocked.
- Do **not** only patch `validateCanonicalIngredientName` — `persistIngredientFromInvoiceItem` has a separate `shouldBlockCanonicalNameOnCreate` call.
- Do **not** broaden `catalogReady` to cover noisy 3-token invoices.
- Do **not** change suggestion generation — suggestions are correct.

## Optional hardening (not required)

In `validateCanonicalIngredientName`, skip block when operational hint equals confirmed name (prevents self-referential messages). Defense-in-depth only; root fix is in `looksLikeSupplierAbbreviatedCatalogName`.
