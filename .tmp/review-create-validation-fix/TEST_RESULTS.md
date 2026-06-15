# Test Results

Run: `npm test -- src/lib/canonical-ingredient-operational-name.test.ts src/lib/canonical-ingredient-create.test.ts`

```
Test Files  2 passed (2)
     Tests  62 passed (62)
```

## New tests

### `canonical-ingredient-operational-name.test.ts`

- `does not block title-cased cleaned catalog names` — `Pêra abacate`, `Ovo classe M`, `Salada ibérica` → `shouldBlockCanonicalNameOnCreate` = false
- `still blocks true invoice shorthand` — `ANGUS PTY`, `BAT shoestr` → blocked

### `canonical-ingredient-create.test.ts`

- `allows Phase 2 cleaned suggestions on validate + insert` — `validateCanonicalIngredientName` ok for all three Phase 2 examples
- `creates payload for Phase 2 cleaned suggestions` — `buildExplicitCanonicalInsertPayload` returns non-null payloads for all three

## Related suites (no regressions)

```
npm test -- src/lib/canonical-ingredient-quality.test.ts \
  src/lib/ingredient-auto-persist.test.ts \
  src/lib/bulk-canonical-ingredient-create.test.ts \
  src/lib/canonical-ingredient-rename.test.ts
```

```
Test Files  4 passed (4)
     Tests  47 passed (47)
```

`ANGUS PTY` and `BAT shoestr` remain blocked in auto-persist and rename paths.
