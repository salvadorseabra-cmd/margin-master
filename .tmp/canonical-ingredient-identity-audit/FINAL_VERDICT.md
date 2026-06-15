# Final Verdict — Canonical Ingredient Identity Audit

**Audit date:** 2026-06-15  
**Workspace:** `/Users/salvadorseabra1/margin-master`  
**Type:** Read-only investigation — no code changes

---

## Verdict

# `IMPROVE_CANONICALS_FIRST`

---

## 1. Exact root cause(s)

**Multiple deterministic gaps — not LLM/prompt failure:**

1. **Incomplete normalization layer** — `cleanCanonicalIngredientNameForCatalog` does not strip supplier brands (Coimbra, MORENO), packaging codes (FSTK, EMB, cartão), or channel tokens (dúzias, s/sal).
2. **Missing culinary ontology** — no semantic mapping from invoice descriptions to canonical culinary identities for produce, herbs, eggs, dairy.
3. **Anti-alias guard UX gap** — `confirmedNameMatchesInvoiceAlias` correctly blocks submit-equivalent names but incorrectly shows **empty** for already-good simple names (Tomilho, Manjericão).

Canonical suggestions are **100% deterministic TypeScript** — no model, no prompt, no confidence threshold.

---

## 2. Why canonical suggestions are weak

For branded/packaged lines, the system applies title-case and partial token stripping but retains noise:

| Invoice | Suggested | Retained noise |
|---------|-----------|----------------|
| Manteiga Coimbra s/Sal EMB 1 Kg | Manteiga coimbra s/sal emb | brand, s/sal, emb |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | Ovo moreno classe M dúzias cartão | brand, grade, channel |
| Salada Ibérica FSTK EMB. 250g | *(nulled)* | ibérica, fstk, emb, 250g |

Mechanism: display cleanup path with incomplete `CATALOG_NOISE_TOKENS`; `emb` is identity-mapped to itself; grade `M` preserved by acronym allowlist.

---

## 3. Why some are empty

Not bugs. The alias-equality guard at `canonical-ingredient-create.ts:174-178` sets `suggestedCanonicalName = null` when normalized cleanup ≡ invoice alias.

Affected: Tomilho, Manjericão, Hortelã, Alho Francês, Abóbora Butternut, Courgettes, Pêra Abacate Hasse, Salada Ibérica FSTK EMB. 250g.

These invoice names are often **already good catalog names** — the system refuses to suggest them because suggestion would equal alias.

---

## 4. Recommended improvement path

**Hybrid Option D (phased):**

| Phase | Change | Impact |
|-------|--------|--------|
| 1 | Guard UX — pre-fill acceptable simple produce names | Fixes EMPTY on herbs/produce |
| 2 | Extend normalization tokens (brands, pack codes) | Fixes WEAK on branded lines |
| 3 | Culinary seed map (herbs, produce, eggs, dairy) | Fixes semantic gaps |

Estimated effort: 3–4 weeks phased. Expected gain: +30–40 pp usable rate.

---

## 5. Review & Create now or later?

**Later** — or invoice-scoped only (Bocconcino shorthand).

Do **not** bulk-create on Bidfood produce/herbs (0% usable suggestions). Emporio branded lines similarly risky.

---

## 6. Estimated catalog quality today

| Scope | EX+ACC (usable) |
|-------|-----------------|
| Review & Create unmatched (33 rows) | **27.3%** |
| All VL v30 unique names (51 rows) | **39.2%** |
| Bidfood unmatched (10 rows) | **0%** |

**Overall headline: ~27% usable on Review & Create scope.**

---

## 7. Estimated catalog quality after recommended fix

| Scope | EX+ACC (usable) |
|-------|-----------------|
| Review & Create unmatched | **~55–65%** |
| Bidfood unmatched | **~50–60%** |

---

## Deliverables index

| File | Content |
|------|---------|
| `CANONICAL_PIPELINE_TRACE.md` | Full pipeline from OCR to UI |
| `EMPTY_CANONICAL_AUDIT.md` | Per-item empty suggestion analysis |
| `WEAK_CANONICAL_AUDIT.md` | Token-level weak suggestion trace |
| `CATALOG_QUALITY_SCORECARD.md` | Classification counts and percentages |
| `ROOT_CAUSE_ANALYSIS.md` | Hypothesis evaluation with evidence |
| `IMPROVEMENT_OPTIONS.md` | Options A–D with effort/risk/gain |
| `REVIEW_CREATE_IMPACT.md` | Manual burden estimates |
| `scorecard-data.json` | Machine-readable scoring output |

---

## One-line summary

Validation Lab data pipeline is sound; canonical suggestion is deterministic but under-engineered for Portuguese foodservice produce — **improve before large-scale Review & Create**.
