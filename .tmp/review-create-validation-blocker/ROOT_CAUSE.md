# Root Cause — Review & Create Validation Blocker

## Symptom

Users see: `Use "Pêra abacate" (or another full catalog name). Invoice shorthand belongs in alias memory.`

The confirmed name field already contains exactly `"Pêra abacate"`. Create is blocked.

## Exact root cause

Two-layer mismatch between **suggestion generation** (Phase 2 cleanup) and **create validation** (pre-Phase-2 shorthand guards):

1. `buildCanonicalIngredientCreateDefaults` correctly produces cleaned suggestions (e.g. `"Pêra Abacate Hasse"` → `"Pêra abacate"`, `"Ovo MORENO Classe M…"` → `"Ovo classe M"`).

2. On submit, `validateCanonicalIngredientName` reaches `shouldBlockCanonicalNameOnCreate(name)`.

3. `shouldBlockCanonicalNameOnCreate` delegates to `looksLikeSupplierAbbreviatedCatalogName`, which returns **true** when `looksLikeInvoiceShorthandName(trimmed.toUpperCase())` even if `looksLikeInvoiceShorthandName(trimmed)` is **false**.

4. Uppercasing title-cased catalog names re-triggers the shorthand heuristic:
   - `"Pêra abacate"` → `"PÊRA ABACATE"` — `PÊRA` is a ≤4-char token → flagged as shorthand
   - `"Ovo classe M"` → `"OVO CLASSE M"` — `OVO` is a ≤4-char token → flagged as shorthand

5. Error message uses `generateOperationalIngredientName(name)` as the hint. For already-clean names, that function returns the **same string**, producing a self-referential error.

## What is NOT the root cause

- Phase 1 `catalogReady` logic is not broken — it simply does not apply to Phase 2 rows where cleaned name ≠ invoice alias.
- The alias-equality guard (`"Enter a catalog name, not invoice shorthand"`) is not firing; the `shouldBlockCanonicalNameOnCreate` path is.
- Dialog vs bulk do not use different validators.

## Severity

**High** — blocks all Phase 2 cleaned suggestions that contain short tokens when title-cased (produce pairs, egg grades, etc.).
