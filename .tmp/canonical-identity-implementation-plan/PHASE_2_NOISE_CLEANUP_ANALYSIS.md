# Phase 2 — Noise Cleanup Analysis

**Planning date:** 2026-06-15  
**Scope:** WEAK canonicals caused by retained noise tokens

---

## Primary noise tokens and sources

| Token | Example invoice | Retained in suggestion | Source |
|-------|-------------------|------------------------|--------|
| Coimbra | Manteiga Coimbra s/Sal EMB 1 Kg | `coimbra` | Not in `CATALOG_NOISE_TOKENS` |
| MORENO | Ovo MORENO Classe M… | `moreno` | Not in noise sets |
| EMB | Manteiga… / Salada Ibérica… | `emb` | `OPERATIONAL_ALIASES.emb = "emb"` identity no-op |
| FSTK | Salada Ibérica FSTK EMB. 250g | `fstk` | Not in noise sets |
| Metro Chef | Arroz Agulha Metro Chef 12x1kg | `metro cheddar` (corrupt) | Brand not stripped; alias expansion side effect |
| Hasse | Pêra Abacate Hasse | `hasse` | Not in noise sets |

---

## Normalization layers (current pipeline)

```
invoiceAlias
 → [operational path?] expandSupplierAbbreviations (OPERATIONAL_ALIASES)
 → cleanCanonicalIngredientNameForCatalog
     → removePackagingPhrases (CX_COUNT_PHRASE_RE strips Cx.15)
     → removeCatalogNoisePhrases (retail chains only: continente, auchan…)
     → BULK_ATTACHED_KG_RE (strips 1 Kg)
     → shouldDropCatalogToken per token
 → formatCanonicalIngredientDisplayName (title case)
```

**Matcher uses separate path:** `canonicalizeIngredientIdentity` in `ingredient-identity.ts` with `COMMERCIAL_NOISE_TOKENS` — also missing Coimbra/MORENO/Hasse/Metro Chef.

---

## Candidate cleanup opportunities

| Location | Change |
|----------|--------|
| `CATALOG_NOISE_TOKENS` | Add: `coimbra`, `moreno`, `hasse`, `simonetta`, `toschi`, `caputo`, `metro`, `chef`, `fstk`, `cartao`, `cartão`, `duzias`, `dúzias` |
| `CATALOG_NOISE_PHRASES` | Add: `metro chef` |
| `OPERATIONAL_ALIASES` | Change `emb` from identity no-op to strip (or remove from resolvable tokens) |
| `shouldDropCatalogToken` | Category-aware: drop `250g` on salad/produce (ontology hook or simple category flag) |
| `DISPLAY_ACRONYM_ALLOWLIST` | Coordinate with Phase 3: strip standalone `M` when preceded by `classe` on eggs |

**Note:** `ibérica` on salad mix is SOMETIMES KEEP per attribute framework — do not add to global noise list.

---

## Rows expected to flip (Phase 2 alone, on baseline)

| Row | Current | Expected after Phase 2 |
|-----|---------|------------------------|
| Manteiga Coimbra… | WEAK | ACCEPTABLE (`Manteiga s/sal` — `sem sal` needs Phase 3) |
| Ovo MORENO… | WEAK | ACCEPTABLE (`Ovo classe M`) |
| Salada Ibérica FSTK… | EMPTY | ACCEPTABLE (`Salada ibérica`) |
| Pêra Abacate Hasse | EMPTY | ACCEPTABLE (`Pêra abacate`) |
| MOZZA… Simonetta | WEAK | ACCEPTABLE (strip Simonetta) |
| Farina… Caputo | WEAK | ACCEPTABLE |

**Not fixed by Phase 2 alone:** Emporio Rovagnati/Rigamonti lines (brand is product-defining).

---

## Score improvement estimates

| Scenario | Usable rate | Assumption |
|----------|-------------|------------|
| Phase 2 alone (no Phase 1) | **36–42%** | +3 to +5 rows from WEAK/EMPTY |
| Phase 1 + 2 combined | **55–58%** (18–19/33) | Phase 1 six rows + Phase 2 four rows |
| Bidfood after Phase 1+2 | **70–80%** (7–8/10) | Manteiga + Ovo + Salada + Pêra |

---

## Implementation complexity

| Dimension | Assessment |
|-----------|------------|
| Effort | **MEDIUM** — ~1–2 weeks |
| Schema changes | **None** |
| Test surface | `canonical-ingredient-display-name.test.ts` (90g vs 180g preservation) |
| Risk | **LOW–MEDIUM** — token whack-a-mole without ontology guardrails |

---

## Coupling note

`buildCatalogIngredientIdentity` applies same cleanup on persist — improved cleanup improves stored `normalized_name` for new creates but does **not** change matcher keys (see `MATCHING_SAFETY_ANALYSIS.md`).
