# Empty Canonical Audit

**Audit date:** 2026-06-15  
**Method:** Live execution of `buildCanonicalIngredientCreateDefaults` on reported examples

---

## Summary

| Invoice line | Suggested | Root cause |
|--------------|-----------|------------|
| Tomilho | `null` | Anti-alias guard (case-only cleanup) |
| Manjericão | `null` | Anti-alias guard |
| Hortelã | `null` | Anti-alias guard |
| Alho Francês | `null` | Anti-alias guard |
| Abóbora Butternut | `null` | Anti-alias guard (variant casing only) |
| Courgettes | `null` | Anti-alias guard |
| Pêra Abacate Hasse | `null` | Anti-alias guard (brand retained but still ≡ after normalize) |
| Salada Ibérica FSTK EMB. 250g | `null`* | Anti-alias guard after fold |

\*Produces intermediate text `"Salada ibérica fstk emb 250g"` but guard nulls it because normalized key equals invoice.

**Verdict:** Not a bug, parser issue, prompt issue, model issue, or confidence threshold. This is an **intentional anti-pollution guard** combined with a **UX gap** for already-good culinary names.

---

## Mechanism: `confirmedNameMatchesInvoiceAlias`

```73:81:src/lib/canonical-ingredient-create.ts
function confirmedNameMatchesInvoiceAlias(
  confirmedName: string,
  invoiceAlias: string,
): boolean {
  const fold = (value: string) => normalizeIngredientName(value.trim());
  const a = fold(confirmedName);
  const b = fold(invoiceAlias);
  return a.length > 0 && a === b;
}
```

Applied at suggestion time:

```174:178:src/lib/canonical-ingredient-create.ts
  if (
    suggestedCanonicalName &&
    confirmedNameMatchesInvoiceAlias(suggestedCanonicalName, invoiceAlias)
  ) {
    suggestedCanonicalName = null;
  }
```

**Design intent:** Prevent suggesting a catalog name identical to the invoice alias (which would fail validation on submit with *"Enter a catalog name, not invoice shorthand"*).

**Side effect:** Simple produce/herb names where cleanup only changes casing are suppressed — UI shows blank even when the invoice name is already a good canonical.

---

## Per-item analysis

### Tomilho / Manjericão / Hortelã / Alho Francês / Courgettes

| Step | Result |
|------|--------|
| Shorthand check | `looksLikeInvoiceShorthandName` → **false** |
| Supplier-abbrev check | `looksLikeSupplierAbbreviatedCatalogName` → **false** |
| Path taken | `formatCanonicalIngredientDisplayName(invoiceAlias)` |
| Cleanup | Title-case only: `"Tomilho"`, `"Manjericão"`, etc. |
| Normalize fold | `"tomilho"`, `"manjericao"`, `"hortela"`, `"alho frances"`, `"courgettes"` |
| Guard | Folded suggestion **===** folded invoice → **`null`** |

These are **already excellent culinary names**. The system correctly refuses to "improve" them but incorrectly shows **empty** instead of pre-filling them as acceptable defaults.

### Abóbora Butternut

| Step | Result |
|------|--------|
| Display cleanup | `"Abóbora butternut"` (title case second word) |
| Normalize fold | `"abobora butternut"` for both invoice and suggestion |
| Guard | **null** |

No culinary ontology maps `"Abóbora Butternut"` → `"Abóbora"` or `"Abóbora manteiga"`. Without ontology, cleanup cannot produce a distinct normalized key.

### Pêra Abacate Hasse

| Step | Result |
|------|--------|
| Path | Display cleanup (not operational — no resolvable alias tokens) |
| Cleanup | `"Pêra abacate hasse"` |
| Brand token `Hasse` | **Not** in `CATALOG_NOISE_TOKENS` or `CATALOG_NOISE_PHRASES` |
| Normalize fold | `"pera abacate hasse"` ≡ invoice |
| Guard | **null** |

Brand stripping would be needed to suggest `"Pêra abacate"`, but even that might still match depending on invoice text. Currently no brand removal → empty.

### Salada Ibérica FSTK EMB. 250g

| Step | Result |
|------|--------|
| Intermediate suggestion | `"Salada ibérica fstk emb 250g"` |
| Tokens stripped | Punctuation only; `250g` preserved as operational gram token |
| Tokens retained | `ibérica`, `fstk`, `emb` (not in noise lists) |
| Normalize fold | `"salada iberica fstk emb 250g"` ≡ invoice after fold |
| Guard | **null** (classified EMPTY in scorecard despite visible intermediate text) |

---

## Ruled-out hypotheses

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| Bug | **No** | Guard behaves as coded; tests explicitly cover this (`does not suggest when cleanup preview equals invoice alias`) |
| Fallback failure | **No** | No fallback chain exists — single deterministic path |
| Prompt issue | **No** | No LLM in suggestion path |
| Parser / OCR issue | **No** | Invoice names extracted correctly in VL data |
| Confidence threshold | **No** | No scoring/threshold in `buildCanonicalIngredientCreateDefaults` |
| Missing field | **No** | All required fields present; `suggestedCanonicalName` intentionally set to `null` |

---

## UX gap (not data correctness)

For herbs and simple produce, the invoice line **is** the desired catalog name. The anti-alias guard treats "Tomilho" → "Tomilho" as pollution, but for Review & Create the user must manually re-type an acceptable name.

**Recommended UX distinction (future, not implemented):**
- Block submit when confirmed name ≡ alias (keep validation)
- Pre-fill suggestion for simple produce even when ≡ alias, with label *"Invoice name is already a good catalog name"*
