# Validation Results — Phase 2 Invoice Examples

Verified via `buildCanonicalIngredientCreateDefaults` + `validateCanonicalIngredientName` + `shouldBlockCanonicalNameOnCreate` (covered in `canonical-ingredient-create.test.ts` and `canonical-ingredient-operational-name.test.ts`).

| Invoice alias | Suggested name | `validateCanonicalIngredientName` | `shouldBlockCanonicalNameOnCreate` | `buildExplicitCanonicalInsertPayload` |
|---|---|---|---|---|
| Pêra Abacate Hasse | Pêra abacate | **PASS** (`ok: true`) | **PASS** (not blocked) | **PASS** (payload created) |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | Ovo classe M | **PASS** (`ok: true`) | **PASS** (not blocked) | **PASS** (payload created) |
| Salada Ibérica FSTK EMB. 250g | Salada ibérica | **PASS** (`ok: true`) | **PASS** (not blocked) | **PASS** (payload created) |

## Shorthand control (still blocked)

| Name | `validateCanonicalIngredientName` | `shouldBlockCanonicalNameOnCreate` |
|---|---|---|
| ANGUS PTY | **BLOCKED** | **BLOCKED** |
| BAT shoestr | **BLOCKED** | **BLOCKED** |
